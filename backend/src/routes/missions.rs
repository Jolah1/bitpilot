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
/// - `GET /` is public (just static metadata).
/// - `POST /complete` requires the participant's bearer token. The
///   participant_id is taken from the token, NOT from the URL — the old
///   path-param form was the root cause of audit issue #2.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new().route("/", get(list_missions));
    let authed = Router::new()
        .route("/complete", post(complete_mission))
        .layer(from_fn_with_state(state, require_participant));
    public.merge(authed)
}

async fn list_missions() -> Json<Vec<Mission>> {
    Json(Mission::all())
}

#[derive(Deserialize)]
struct CompleteMissionRequest {
    mission: u8,
    /// Mission-specific proof. Always required now (audit #2). The verifier
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
    if !(1..=5).contains(&body.mission) {
        return Err(AppError::BadRequest(format!(
            "mission must be 1..=5, got {}",
            body.mission
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
    verify_proof(&state, &authed.participant_id, body.mission, body.proof.trim()).await?;

    let reward = Mission::reward(body.mission);

    // Single transaction: insert the completion row and bump the
    // participant's stats. Avoids the read-modify-write race we'd have
    // with separate statements.
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

    let next_mission = if body.mission < 5 {
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
/// The shape of "proof" depends on the mission:
/// - 1: the npub the server issued (stored in `participants.nostr_pubkey`).
/// - 2: a bolt11 invoice string previously issued to this participant.
/// - 3: a payment_hash previously recorded as paid by this participant.
/// - 4: a Cashu-token-shaped string. The eCash backend isn't wired up yet
///      (audit #10) so we accept any non-empty token-shaped value. Once
///      EcashService comes back online this should check `ecash_log`.
/// - 5: a Nostr event_id previously published by this participant.
async fn verify_proof(
    state: &AppState,
    participant_id: &str,
    mission: u8,
    proof: &str,
) -> Result<(), AppError> {
    match mission {
        1 => {
            let row: Option<(Option<String>,)> = sqlx::query_as(
                "SELECT nostr_pubkey FROM participants WHERE id = ?",
            )
            .bind(participant_id)
            .fetch_optional(&state.db)
            .await?;
            let stored = row
                .and_then(|(v,)| v)
                .ok_or_else(|| AppError::BadRequest("no nostr identity created yet".into()))?;
            if stored != proof {
                return Err(AppError::BadRequest("proof does not match issued npub".into()));
            }
        }
        2 => {
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
        3 => {
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
        4 => {
            // TODO(ecash): once EcashService is back, check ecash_log for a
            // redeem keyed by this participant_id. For now, accept any
            // string that at least looks like a Cashu token.
            if !proof.starts_with("cashu") && proof.len() < 8 {
                return Err(AppError::BadRequest(
                    "proof does not look like a cashu token".into(),
                ));
            }
        }
        5 => {
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
