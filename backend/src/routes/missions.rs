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
use crate::models::mission::DoKind;
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

/// Returns all missions with each `simulated` flag overridden to reflect
/// runtime reality. Lightning is simulated iff LNbits creds aren't configured;
/// ecash is simulated iff the Cashu mint couldn't be reached at boot; bitcoin
/// and nostr are always real (knowledge-only or real signed events).
async fn list_missions(State(state): State<Arc<AppState>>) -> Json<Vec<Mission>> {
    let mut missions = Mission::all();
    for m in &mut missions {
        // Only override the simulated flag for missions whose catalogue
        // entry already marked them as "depends on external service".
        // Knowledge missions stay simulated=false regardless.
        if !m.simulated {
            continue;
        }
        m.simulated = match m.tech.as_str() {
            "lightning" => state.lightning.simulated,
            "ecash" => state.ecash.simulated,
            _ => m.simulated, // nostr/bitcoin sim flag (e.g. seed words, zap stub) stays as-is
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
    if !(Mission::FIRST..=Mission::LAST).contains(&body.mission) {
        return Err(AppError::BadRequest(format!(
            "mission must be {}..={}, got {}",
            Mission::FIRST,
            Mission::LAST,
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

    let next_mission = if body.mission < Mission::LAST {
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
/// The mapping from mission number → ledger lives in `Mission::do_kind`;
/// here we just translate each kind into the right SQL probe. New mission
/// kinds added to the enum become a compile error here until handled —
/// that's deliberate.
async fn verify_proof(
    state: &AppState,
    participant_id: &str,
    mission: u8,
    proof: &str,
) -> Result<(), AppError> {
    match Mission::do_kind(mission) {
        // Knowledge missions: client must submit *something* (we checked
        // non-empty above); there's no server-side artifact to compare to.
        // The proof string gets recorded in mission_completions for audit.
        DoKind::Knowledge => Ok(()),

        // Mission 14: Nostr identity created in browser; client submits the
        // npub it generated. We don't validate the bech32 here beyond
        // "non-empty"; the very fact that the participant possesses an npub
        // and is willing to publicly tie it to their participant_id is the
        // proof. Stored on the participant row so missions 26/27/30/36 can
        // verify "this is the same identity".
        DoKind::NostrIdentity => {
            // Update the participant row with the submitted npub. This is
            // the only mission that *writes* an identity-binding. We accept
            // any non-empty string that looks like a bech32 npub.
            if !proof.starts_with("npub1") || proof.len() < 32 || proof.len() > 90 {
                return Err(AppError::BadRequest("proof must be a bech32 npub".into()));
            }
            sqlx::query("UPDATE participants SET nostr_pubkey = ? WHERE id = ?")
                .bind(proof)
                .bind(participant_id)
                .execute(&state.db)
                .await?;
            Ok(())
        }

        // Mission 23: lightning receive — proof is a bolt11 we issued.
        DoKind::Invoice => verify_log(state, participant_id, "lightning_log", "invoice", proof).await,

        // Mission 24: lightning send — proof is the recorded payment_hash.
        DoKind::Pay => verify_log(state, participant_id, "lightning_log", "payment", proof).await,

        // Mission 33: ecash claim — proof is the minted token string.
        DoKind::EcashClaim => verify_log(state, participant_id, "ecash_log", "mint", proof).await,

        // Mission 34: ecash spend — proof is the redeemed token string.
        DoKind::EcashSpend => verify_log(state, participant_id, "ecash_log", "redeem", proof).await,

        // Mission 26: nostr publish (kind-1) — proof is the event id.
        DoKind::NostrPublish => verify_nostr_event(state, participant_id, proof).await,

        // Mission 27: nostr profile (kind-0) — same ledger, same shape.
        DoKind::NostrProfile => verify_nostr_event(state, participant_id, proof).await,

        // Mission 30: nostr follow list (kind-3) — same ledger.
        DoKind::NostrFollow => verify_nostr_event(state, participant_id, proof).await,

        // Mission 36: zap receipt — currently simulated; the backend
        // generates a synthetic event_id and records it in nostr_log too,
        // so the same verifier works.
        DoKind::NostrZap => verify_nostr_event(state, participant_id, proof).await,

        // Mission 42: signet on-chain — proof is a 64-hex txid. We ask
        // mempool.space/signet whether the tx exists. This is the only
        // verifier that hits the public internet for verification.
        DoKind::OnchainSignet => verify_signet_txid(proof).await,

        // Mission 11: seed words generated client-side. We can't verify
        // randomness without seeing it (and we don't want to). Proof is
        // a sha256 of the mnemonic the client generated — a commitment.
        // We accept any 64-character lowercase hex string.
        DoKind::SeedWords => {
            if proof.len() != 64 || !proof.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(AppError::BadRequest(
                    "proof must be a 64-char hex commitment".into(),
                ));
            }
            Ok(())
        }

        // Mission 41: derived address from the BIP39 seed. Client derives
        // m/84'/0'/0'/0/0 and submits the address. We accept any string
        // starting with "bc1" or "tb1" (mainnet/testnet bech32 prefixes) —
        // we don't have a full BIP32 implementation server-side, and the
        // pedagogical goal is "you saw an address come out of a seed",
        // not cryptographic verification.
        DoKind::DeriveAddress => {
            let lower = proof.to_lowercase();
            if !(lower.starts_with("bc1") || lower.starts_with("tb1") || lower.starts_with("bcrt1"))
            {
                return Err(AppError::BadRequest(
                    "proof must be a bech32 segwit address (bc1.../tb1.../bcrt1...)".into(),
                ));
            }
            Ok(())
        }
    }
}

/// Generic ledger probe: "is there a row in `table` for this participant
/// with the given kind and artifact?". Used by every mission whose proof is
/// "the artifact the server just handed you back".
async fn verify_log(
    state: &AppState,
    participant_id: &str,
    table: &str,
    kind: &str,
    artifact: &str,
) -> Result<(), AppError> {
    // table and kind are compile-time constants from this module, never
    // user input — safe to interpolate into the SQL.
    let sql = format!(
        "SELECT artifact FROM {table} \
         WHERE participant_id = ? AND kind = ? AND artifact = ?"
    );
    let row: Option<(String,)> = sqlx::query_as(&sql)
        .bind(participant_id)
        .bind(kind)
        .bind(artifact)
        .fetch_optional(&state.db)
        .await?;
    if row.is_none() {
        return Err(AppError::BadRequest(format!(
            "no {kind} with that artifact recorded for you"
        )));
    }
    Ok(())
}

async fn verify_nostr_event(
    state: &AppState,
    participant_id: &str,
    event_id: &str,
) -> Result<(), AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM nostr_log \
         WHERE participant_id = ? AND event_id = ?",
    )
    .bind(participant_id)
    .bind(event_id)
    .fetch_optional(&state.db)
    .await?;
    if row.is_none() {
        return Err(AppError::BadRequest(
            "no nostr event with that id recorded for you".into(),
        ));
    }
    Ok(())
}

/// Verify a signet transaction id exists by asking mempool.space.
///
/// We don't try to check the amount or destination — the pedagogical goal
/// is "you broadcast a real transaction to a real Bitcoin network and we
/// can independently see it." If mempool.space returns 200 OK for
/// /api/tx/<txid>, the tx exists.
async fn verify_signet_txid(txid: &str) -> Result<(), AppError> {
    // Be strict about shape: 64 lowercase hex chars. Anything else is
    // either a typo or a probe.
    let txid_clean = txid.trim().to_lowercase();
    if txid_clean.len() != 64 || !txid_clean.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::BadRequest(
            "txid must be 64 hex characters".into(),
        ));
    }

    // mempool.space has a public signet API. 5 sec timeout — if it's slow
    // we fail the verification rather than hanging the request.
    let url = format!("https://mempool.space/signet/api/tx/{txid_clean}");
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("bitpilot/0.1")
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(AppError::Internal(anyhow::anyhow!("http client: {e}"))),
    };

    let res = client.get(&url).send().await.map_err(|e| {
        // Network errors are 502 — we can't reach the verifier. Treat as
        // "try again later" not "your txid is wrong".
        tracing::warn!(error = %e, "mempool.space request failed");
        AppError::Lightning(format!("could not reach mempool.space: {e}"))
    })?;

    match res.status().as_u16() {
        200 => Ok(()),
        404 => Err(AppError::BadRequest(
            "transaction not found on signet — wait for it to propagate, or check the txid".into(),
        )),
        other => Err(AppError::Lightning(format!(
            "mempool.space returned HTTP {other}"
        ))),
    }
}
