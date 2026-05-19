use axum::{
    extract::{Extension, State},
    middleware::from_fn_with_state,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::{require_participant, AuthedParticipant};
use crate::error::AppError;
use crate::models::{now, Mission, Participant};
use crate::routes::participants::load_participant;
use crate::state::AppState;

/// `/api/missions/...`
/// - `GET /` is public (static metadata, but with `simulated` overlaid).
/// - `POST /complete` requires the participant's bearer token. The
///   participant_id is taken from the token, NOT from the URL.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new().route("/", get(list_missions));
    let authed = Router::new()
        .route("/complete", post(complete_mission))
        .layer(from_fn_with_state(state, require_participant));
    public.merge(authed)
}

/// Returns the 10 missions with each `simulated` flag overridden to reflect
/// runtime reality. Lightning is simulated iff LNbits creds aren't configured;
/// ecash is simulated iff the Cashu mint couldn't be reached at boot; bitcoin
/// and nostr are always real (knowledge-only or real signed events).
async fn list_missions(State(state): State<Arc<AppState>>) -> Json<Vec<Mission>> {
    let mut missions = Mission::all();
    for m in &mut missions {
        m.simulated = match m.tech.as_str() {
            "lightning" => state.lightning.simulated,
            "ecash" => state.ecash.simulated,
            _ => false,
        };
    }
    Json(missions)
}

#[derive(Deserialize)]
struct CompleteMissionRequest {
    mission: u8,
    /// Mission-specific proof. Always required (audit #2). The verifier
    /// behind each mission decides what counts.
    proof: String,
}

#[derive(Serialize)]
struct CompleteMissionResponse {
    participant: Participant,
    sats_earned: u64,
    next_mission: Option<u8>,
}

async fn complete_mission(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<CompleteMissionRequest>,
) -> Result<Json<CompleteMissionResponse>, AppError> {
    let total = Mission::count();
    if !(1..=total).contains(&body.mission) {
        return Err(AppError::BadRequest(format!(
            "mission must be 1..={}, got {}",
            total, body.mission
        )));
    }
    if body.proof.trim().is_empty() {
        return Err(AppError::BadRequest(
            "proof is required to complete a mission".into(),
        ));
    }

    let p = load_participant(&state, &authed.participant_id).await?;

    if p.completed_missions.contains(&body.mission) {
        return Err(AppError::BadRequest("Mission already completed".into()));
    }
    if p.current_mission != body.mission {
        return Err(AppError::BadRequest("Not your current mission".into()));
    }

    // ── Verify the proof against the appropriate server-side ledger ─────
    verify_proof(
        &state,
        &authed.participant_id,
        body.mission,
        body.proof.trim(),
    )
    .await?;

    let reward = Mission::reward(body.mission);

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO mission_completions (participant_id, mission, proof, completed_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&authed.participant_id)
    .bind(body.mission as i64)
    .bind(&body.proof)
    .bind(now() as i64)
    .execute(&mut *tx)
    .await?;

    let next_mission = if body.mission < total {
        Some(body.mission + 1)
    } else {
        None
    };

    sqlx::query(
        "UPDATE participants SET sats_earned = sats_earned + ?, current_mission = ? WHERE id = ?",
    )
    .bind(reward as i64)
    .bind(next_mission.unwrap_or(body.mission) as i64)
    .bind(&authed.participant_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let updated = load_participant(&state, &authed.participant_id).await?;
    Ok(Json(CompleteMissionResponse {
        participant: updated,
        sats_earned: reward,
        next_mission,
    }))
}

/// Verify that a submitted proof matches what the server expects for the
/// given mission. Returns `BadRequest` on mismatch.
///
/// Mission tech mapping (see backend/src/models/mission.rs):
///   1, 2, 7 → bitcoin (knowledge-only, no server artifact to verify)
///   3       → nostr identity creation
///   4       → nostr public-vs-private quiz
///   5       → lightning receive (invoice issued)
///   6       → lightning send (payment recorded)
///   8       → ecash claim (token redeemed)
///   9       → ecash spend (token minted)
///   10      → nostr publish (event recorded)
async fn verify_proof(
    state: &AppState,
    participant_id: &str,
    mission: u8,
    proof: &str,
) -> Result<(), AppError> {
    match mission {
        // Knowledge-only missions: client must submit *something* but there
        // is no server-side artifact. The proof slot still gets stored in
        // mission_completions for auditing.
        1 | 2 | 4 | 7 => {
            // Already checked non-empty above; nothing more to verify.
        }
        // Nostr identity creation: proof must equal the npub the server
        // issued and stored on this participant.
        3 => {
            let row: Option<(Option<String>,)> =
                sqlx::query_as("SELECT nostr_pubkey FROM participants WHERE id = ?")
                    .bind(participant_id)
                    .fetch_optional(&state.db)
                    .await?;
            let stored = row
                .and_then(|(v,)| v)
                .ok_or_else(|| AppError::BadRequest("no nostr identity created yet".into()))?;
            if stored != proof {
                return Err(AppError::BadRequest(
                    "proof does not match issued npub".into(),
                ));
            }
        }
        // Lightning receive: bolt11 invoice we issued.
        5 => {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT artifact FROM lightning_log \
                 WHERE participant_id = ? AND kind = 'invoice' AND artifact = ?",
            )
            .bind(participant_id)
            .bind(proof)
            .fetch_optional(&state.db)
            .await?;
            if row.is_none() {
                return Err(AppError::BadRequest(
                    "no invoice with that string was issued to you".into(),
                ));
            }
        }
        // Lightning send: payment_hash recorded.
        6 => {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT artifact FROM lightning_log \
                 WHERE participant_id = ? AND kind = 'payment' AND artifact = ?",
            )
            .bind(participant_id)
            .bind(proof)
            .fetch_optional(&state.db)
            .await?;
            if row.is_none() {
                return Err(AppError::BadRequest(
                    "no payment with that hash recorded for you".into(),
                ));
            }
        }
        // eCash claim (mission 8): token that was redeemed into the
        // participant's wallet — i.e. they received it.
        8 => {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT artifact FROM ecash_log \
                 WHERE participant_id = ? AND kind = 'redeem' AND artifact = ?",
            )
            .bind(participant_id)
            .bind(proof)
            .fetch_optional(&state.db)
            .await?;
            if row.is_none() {
                return Err(AppError::BadRequest(
                    "no redeemed cashu token with that string for you".into(),
                ));
            }
        }
        // eCash spend (mission 9): token the participant *minted* to send.
        9 => {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT artifact FROM ecash_log \
                 WHERE participant_id = ? AND kind = 'mint' AND artifact = ?",
            )
            .bind(participant_id)
            .bind(proof)
            .fetch_optional(&state.db)
            .await?;
            if row.is_none() {
                return Err(AppError::BadRequest(
                    "no minted cashu token with that string for you".into(),
                ));
            }
        }
        // Nostr publish: event_id recorded.
        10 => {
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT event_id FROM nostr_log \
                 WHERE participant_id = ? AND event_id = ?",
            )
            .bind(participant_id)
            .bind(proof)
            .fetch_optional(&state.db)
            .await?;
            if row.is_none() {
                return Err(AppError::BadRequest(
                    "no nostr note with that event_id recorded for you".into(),
                ));
            }
        }
        _ => unreachable!("mission range checked above"),
    }
    Ok(())
}
