use axum::{
    extract::{Extension, State},
    middleware::from_fn_with_state,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{require_participant, AuthedParticipant};
use crate::error::AppError;
use crate::models::now;
use crate::state::AppState;

/// Per-call payment ceiling in sats. Hard upper bound on any single
/// `/api/pay`. Defaults to 100 sats so even a misconfigured deploy can
/// only leak in small increments before the per-participant cap closes
/// the gap. Override via `MAX_PAYMENT_SATS`.
fn max_payment_sats() -> u64 {
    std::env::var("MAX_PAYMENT_SATS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100)
}

/// Cumulative-per-participant payment ceiling in sats. Summed from the
/// `lightning_payment_audit` table over rows with `decision = 'allowed'`.
/// Defaults to 500 sats. Override via `MAX_PARTICIPANT_PAYOUT_SATS`.
fn max_participant_payout_sats() -> u64 {
    std::env::var("MAX_PARTICIPANT_PAYOUT_SATS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(500)
}

/// Outcome of the cap-decision tree for a single `/api/pay` attempt.
/// Pulled out as a plain enum so the decision is unit-testable without
/// touching SQLite or HTTP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CapDecision {
    Allowed,
    RejectedPerCallCap,
    RejectedParticipantCap,
}

/// Decide whether a payment of `amount` is allowed given the per-call
/// cap, what the participant has already spent (audit-table sum), and the
/// per-participant cap. Pure function over u64 — no I/O.
pub(crate) fn decide(
    amount: u64,
    per_call_cap: u64,
    already_spent: u64,
    participant_cap: u64,
) -> CapDecision {
    if amount > per_call_cap {
        return CapDecision::RejectedPerCallCap;
    }
    if already_spent.saturating_add(amount) > participant_cap {
        return CapDecision::RejectedParticipantCap;
    }
    CapDecision::Allowed
}

fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

/// Write one row to `lightning_payment_audit`. Best-effort: errors are
/// logged but not propagated, because losing audit visibility shouldn't
/// turn a successful payment into a 500 (and vice versa).
async fn write_audit(
    db: &sqlx::SqlitePool,
    participant_id: &str,
    bolt11_hash: &str,
    amount_sats: u64,
    decision: &str,
    reason: Option<&str>,
) {
    let id = Uuid::new_v4().to_string();
    let res = sqlx::query(
        "INSERT INTO lightning_payment_audit \
         (id, participant_id, bolt11_hash, amount_sats, decision, reason, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(participant_id)
    .bind(bolt11_hash)
    .bind(amount_sats as i64)
    .bind(decision)
    .bind(reason)
    .bind(now() as i64)
    .execute(db)
    .await;
    if let Err(e) = res {
        tracing::error!(error = %e, "lightning_payment_audit insert failed");
    }
}

/// All Lightning, Nostr, and eCash endpoints require the participant's
/// bearer token. The participant_id is read from the token, not from the
/// request body. Every response carries `simulated: bool` so the UI can
/// render an honest "Simulated" badge.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/invoice", post(create_invoice))
        .route("/pay", post(pay_invoice))
        // Nostr — every signing-capable endpoint takes nsec per-call. The
        // backend never persists it.
        .route("/nostr/register", post(register_nostr_identity))
        .route("/nostr/publish", post(publish_nostr_note))
        .route("/nostr/profile", post(publish_nostr_profile))
        .route("/nostr/follow", post(publish_nostr_follow))
        .route("/nostr/zap", post(simulate_nostr_zap))
        .route("/ecash/mint", post(mint_ecash))
        .route("/ecash/redeem", post(redeem_ecash))
        .layer(from_fn_with_state(state, require_participant))
}

// ── Lightning ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct CreateInvoiceRequest {
    amount_sats: u64,
    description: String,
}

#[derive(Serialize)]
struct InvoiceResponse {
    invoice: String,
    participant_id: String,
    amount_sats: u64,
    /// `true` if the backend's Lightning service is a simulation. The UI
    /// renders a clear "Simulated" badge so users are never misled into
    /// thinking real sats moved.
    simulated: bool,
}

async fn create_invoice(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<CreateInvoiceRequest>,
) -> Result<Json<InvoiceResponse>, AppError> {
    if body.amount_sats == 0 {
        return Err(AppError::BadRequest("amount_sats must be > 0".into()));
    }
    if body.amount_sats > 1_000_000 {
        return Err(AppError::BadRequest("amount_sats too large".into()));
    }
    if body.description.len() > 280 {
        return Err(AppError::BadRequest("description too long".into()));
    }

    let invoice = state
        .lightning
        .create_invoice(body.amount_sats, &body.description)
        .await?;

    // Record in the proof ledger so mission completion can verify it later.
    sqlx::query(
        "INSERT INTO lightning_log (kind, artifact, participant_id, amount_sats, created_at) \
         VALUES ('invoice', ?, ?, ?, ?)",
    )
    .bind(&invoice)
    .bind(&authed.participant_id)
    .bind(body.amount_sats as i64)
    .bind(now() as i64)
    .execute(&state.db)
    .await?;

    Ok(Json(InvoiceResponse {
        invoice,
        participant_id: authed.participant_id,
        amount_sats: body.amount_sats,
        simulated: state.lightning.simulated,
    }))
}

#[derive(Deserialize)]
struct PayInvoiceRequest {
    invoice: String,
}

#[derive(Serialize)]
struct PaymentResponse {
    payment_hash: String,
    participant_id: String,
    status: String,
    simulated: bool,
}

async fn pay_invoice(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<PayInvoiceRequest>,
) -> Result<Json<PaymentResponse>, AppError> {
    if body.invoice.trim().is_empty() {
        return Err(AppError::BadRequest("invoice must not be empty".into()));
    }

    let bolt11 = body.invoice.trim();
    let bolt11_hash = sha256_hex(bolt11);
    let payouts_real = state.lightning.payouts_allowed;

    // ── Simulated payout path ───────────────────────────────────────────
    // LNbits not configured, or `LIGHTNING_REAL_ALLOW_PAYOUTS=1` not set.
    // No sats move; we still log the attempt for visibility and skip cap
    // enforcement (amount can't be reliably parsed without LNbits to
    // decode, and there's no real-money risk).
    if !payouts_real {
        let payment_hash = state.lightning.pay_invoice(bolt11).await?;

        write_audit(
            &state.db,
            &authed.participant_id,
            &bolt11_hash,
            0,
            "simulated",
            None,
        )
        .await;

        sqlx::query(
            "INSERT INTO lightning_log (kind, artifact, participant_id, amount_sats, created_at) \
             VALUES ('payment', ?, ?, 0, ?)",
        )
        .bind(&payment_hash)
        .bind(&authed.participant_id)
        .bind(now() as i64)
        .execute(&state.db)
        .await?;

        return Ok(Json(PaymentResponse {
            payment_hash,
            participant_id: authed.participant_id,
            status: "paid".into(),
            simulated: true,
        }));
    }

    // ── Real payout path ────────────────────────────────────────────────
    // Decode via LNbits to learn the true amount (the caller cannot be
    // trusted to declare it). Decode failure means we can't enforce caps,
    // so we reject and audit.
    let amount_sats = match state.lightning.decode_invoice(bolt11).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "decode_invoice failed; rejecting payment");
            write_audit(
                &state.db,
                &authed.participant_id,
                &bolt11_hash,
                0,
                "rejected",
                Some("decode_failed"),
            )
            .await;
            return Err(AppError::BadRequest(
                "invoice could not be decoded".into(),
            ));
        }
    };

    let per_call_cap = max_payment_sats();
    let participant_cap = max_participant_payout_sats();

    // Cumulative spend so far for this participant. SQLite SUM over an
    // empty set is NULL; COALESCE keeps the type clean as i64.
    let (already_spent_i,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount_sats), 0) FROM lightning_payment_audit \
         WHERE participant_id = ? AND decision = 'allowed'",
    )
    .bind(&authed.participant_id)
    .fetch_one(&state.db)
    .await?;
    let already_spent = already_spent_i.max(0) as u64;

    match decide(amount_sats, per_call_cap, already_spent, participant_cap) {
        CapDecision::RejectedPerCallCap => {
            write_audit(
                &state.db,
                &authed.participant_id,
                &bolt11_hash,
                amount_sats,
                "rejected",
                Some("per_call_cap"),
            )
            .await;
            return Err(AppError::Forbidden);
        }
        CapDecision::RejectedParticipantCap => {
            write_audit(
                &state.db,
                &authed.participant_id,
                &bolt11_hash,
                amount_sats,
                "rejected",
                Some("participant_cap"),
            )
            .await;
            return Err(AppError::Forbidden);
        }
        CapDecision::Allowed => {}
    }

    // Commit the allowed-audit row BEFORE calling LNbits. If the payment
    // fails after this point, the cap counter still increments — the safe
    // direction for "did we move money or not" ambiguity.
    write_audit(
        &state.db,
        &authed.participant_id,
        &bolt11_hash,
        amount_sats,
        "allowed",
        None,
    )
    .await;

    let payment_hash = state.lightning.pay_invoice(bolt11).await?;

    sqlx::query(
        "INSERT INTO lightning_log (kind, artifact, participant_id, amount_sats, created_at) \
         VALUES ('payment', ?, ?, ?, ?)",
    )
    .bind(&payment_hash)
    .bind(&authed.participant_id)
    .bind(amount_sats as i64)
    .bind(now() as i64)
    .execute(&state.db)
    .await?;

    Ok(Json(PaymentResponse {
        payment_hash,
        participant_id: authed.participant_id,
        status: "paid".into(),
        simulated: false,
    }))
}

// ── Nostr ────────────────────────────────────────────────────────────────────
//
// SECURITY MODEL FOR NSEC:
// The participant generates their keypair in the browser (see frontend
// missions 14). The npub is registered server-side via /nostr/register so
// later proofs can be checked against it. The nsec is stored ONLY in the
// browser (localStorage). For any signing call (publish, profile, follow),
// the browser sends the nsec in the request body; the backend signs+
// broadcasts, then discards the nsec — it is never persisted.
//
// This is still imperfect (the nsec touches the backend in transit + memory)
// but it's a strict improvement over the prior code, where the backend
// generated the keys and returned the nsec to the browser. A future
// hardening pass should do the signing in the browser too with nostr-tools
// and have the backend just relay the pre-signed event.

#[derive(Deserialize)]
struct RegisterIdentityRequest {
    npub: String,
}

#[derive(Serialize)]
struct RegisterIdentityResponse {
    npub: String,
    participant_id: String,
    /// Always `false` — the keypair is real secp256k1 generated client-side.
    simulated: bool,
}

/// `POST /api/nostr/register` — record the npub the browser generated.
/// Doesn't take an nsec. Idempotent for the calling participant.
async fn register_nostr_identity(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<RegisterIdentityRequest>,
) -> Result<Json<RegisterIdentityResponse>, AppError> {
    let npub = body.npub.trim();
    // Light validation: bech32 npub strings are ~63 chars and start with
    // "npub1". We don't fully decode bech32 here — the goal is to reject
    // obvious garbage, not to be cryptographically authoritative.
    if !npub.starts_with("npub1") || npub.len() < 32 || npub.len() > 90 {
        return Err(AppError::BadRequest("npub must be a bech32 string starting with npub1".into()));
    }

    sqlx::query("UPDATE participants SET nostr_pubkey = ? WHERE id = ?")
        .bind(npub)
        .bind(&authed.participant_id)
        .execute(&state.db)
        .await?;

    Ok(Json(RegisterIdentityResponse {
        npub: npub.to_string(),
        participant_id: authed.participant_id,
        simulated: false,
    }))
}

#[derive(Deserialize)]
struct PublishNoteRequest {
    content: String,
    nsec: String,
}

#[derive(Serialize)]
struct PublishNoteResponse {
    event_id: String,
    participant_id: String,
    status: String,
    /// Relays the note was broadcast to. The UI shows these so the user
    /// can verify their note exists on Nostr.
    relays: Vec<String>,
    simulated: bool,
}

async fn publish_nostr_note(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<PublishNoteRequest>,
) -> Result<Json<PublishNoteResponse>, AppError> {
    if body.content.trim().is_empty() {
        return Err(AppError::BadRequest("content must not be empty".into()));
    }
    if body.content.len() > 8000 {
        return Err(AppError::BadRequest("content too long".into()));
    }
    let event_id = state.nostr.publish_note(&body.nsec, &body.content).await?;

    sqlx::query("INSERT INTO nostr_log (event_id, participant_id, created_at) VALUES (?, ?, ?)")
        .bind(&event_id)
        .bind(&authed.participant_id)
        .bind(now() as i64)
        .execute(&state.db)
        .await?;

    Ok(Json(PublishNoteResponse {
        event_id,
        participant_id: authed.participant_id,
        status: "published".into(),
        relays: state.nostr.relays().to_vec(),
        simulated: false,
    }))
}

#[derive(Deserialize)]
struct PublishProfileRequest {
    name: String,
    about: Option<String>,
    nsec: String,
}

async fn publish_nostr_profile(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<PublishProfileRequest>,
) -> Result<Json<PublishNoteResponse>, AppError> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if name.len() > 80 {
        return Err(AppError::BadRequest("name too long (max 80)".into()));
    }
    let about = body
        .about
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    if let Some(a) = about {
        if a.len() > 400 {
            return Err(AppError::BadRequest("about too long (max 400)".into()));
        }
    }

    let event_id = state
        .nostr
        .publish_profile(&body.nsec, name, about)
        .await?;

    sqlx::query("INSERT INTO nostr_log (event_id, participant_id, created_at) VALUES (?, ?, ?)")
        .bind(&event_id)
        .bind(&authed.participant_id)
        .bind(now() as i64)
        .execute(&state.db)
        .await?;

    Ok(Json(PublishNoteResponse {
        event_id,
        participant_id: authed.participant_id,
        status: "published".into(),
        relays: state.nostr.relays().to_vec(),
        simulated: false,
    }))
}

#[derive(Deserialize)]
struct PublishFollowRequest {
    /// The npub the participant is choosing to follow.
    followed_npub: String,
    nsec: String,
}

async fn publish_nostr_follow(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<PublishFollowRequest>,
) -> Result<Json<PublishNoteResponse>, AppError> {
    let target = body.followed_npub.trim();
    if !target.starts_with("npub1") || target.len() < 32 || target.len() > 90 {
        return Err(AppError::BadRequest(
            "followed_npub must be a bech32 npub".into(),
        ));
    }

    let event_id = state.nostr.publish_follow(&body.nsec, target).await?;

    sqlx::query("INSERT INTO nostr_log (event_id, participant_id, created_at) VALUES (?, ?, ?)")
        .bind(&event_id)
        .bind(&authed.participant_id)
        .bind(now() as i64)
        .execute(&state.db)
        .await?;

    Ok(Json(PublishNoteResponse {
        event_id,
        participant_id: authed.participant_id,
        status: "published".into(),
        relays: state.nostr.relays().to_vec(),
        simulated: false,
    }))
}

#[derive(Serialize)]
struct SimulatedZapResponse {
    event_id: String,
    participant_id: String,
    amount_sats: u64,
    status: String,
    simulated: bool,
}

/// `POST /api/nostr/zap` — simulated zap. Generates a fake event id and
/// writes it to nostr_log so the mission verifier passes. This is
/// explicitly flagged `simulated: true` (LNbits + NIP-57 zap receipts is a
/// future ticket; doing it in-band here would dwarf the rest of the work).
async fn simulate_nostr_zap(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<SimulatedZapResponse>, AppError> {
    // 64-hex synthetic event id. Distinguishable from real nostr event ids
    // only by inspection (real ones are sha256(serialised_event)).
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let event_id = format!("{:064x}", ts);

    sqlx::query("INSERT INTO nostr_log (event_id, participant_id, created_at) VALUES (?, ?, ?)")
        .bind(&event_id)
        .bind(&authed.participant_id)
        .bind(now() as i64)
        .execute(&state.db)
        .await?;

    Ok(Json(SimulatedZapResponse {
        event_id,
        participant_id: authed.participant_id,
        amount_sats: 21,
        status: "simulated".into(),
        simulated: true,
    }))
}

// ── eCash ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct MintEcashRequest {
    amount_sats: u64,
}

#[derive(Serialize)]
struct MintEcashResponse {
    token: String,
    participant_id: String,
    amount_sats: u64,
    simulated: bool,
}

async fn mint_ecash(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<MintEcashRequest>,
) -> Result<Json<MintEcashResponse>, AppError> {
    if body.amount_sats == 0 {
        return Err(AppError::BadRequest("amount_sats must be > 0".into()));
    }
    if body.amount_sats > 1_000_000 {
        return Err(AppError::BadRequest("amount_sats too large".into()));
    }
    let token = state.ecash.mint_token(body.amount_sats).await?;

    sqlx::query(
        "INSERT INTO ecash_log (kind, artifact, participant_id, amount_sats, created_at) \
         VALUES ('mint', ?, ?, ?, ?)",
    )
    .bind(&token)
    .bind(&authed.participant_id)
    .bind(body.amount_sats as i64)
    .bind(now() as i64)
    .execute(&state.db)
    .await?;

    Ok(Json(MintEcashResponse {
        token,
        participant_id: authed.participant_id,
        amount_sats: body.amount_sats,
        simulated: state.ecash.simulated,
    }))
}

#[derive(Deserialize)]
struct RedeemEcashRequest {
    token: String,
}

#[derive(Serialize)]
struct RedeemEcashResponse {
    participant_id: String,
    amount_sats: u64,
    status: String,
    simulated: bool,
}

async fn redeem_ecash(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<RedeemEcashRequest>,
) -> Result<Json<RedeemEcashResponse>, AppError> {
    if body.token.trim().is_empty() {
        return Err(AppError::BadRequest("token must not be empty".into()));
    }
    let amount_sats = state.ecash.redeem_token(&body.token).await?;

    sqlx::query(
        "INSERT INTO ecash_log (kind, artifact, participant_id, amount_sats, created_at) \
         VALUES ('redeem', ?, ?, ?, ?)",
    )
    .bind(&body.token)
    .bind(&authed.participant_id)
    .bind(amount_sats as i64)
    .bind(now() as i64)
    .execute(&state.db)
    .await?;

    Ok(Json(RedeemEcashResponse {
        participant_id: authed.participant_id,
        amount_sats,
        status: "redeemed".into(),
        simulated: state.ecash.simulated,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_payment_under_both_caps() {
        assert_eq!(decide(50, 100, 0, 500), CapDecision::Allowed);
        assert_eq!(decide(100, 100, 0, 500), CapDecision::Allowed);
        assert_eq!(decide(50, 100, 450, 500), CapDecision::Allowed);
    }

    #[test]
    fn rejects_payment_over_per_call_cap() {
        assert_eq!(decide(101, 100, 0, 500), CapDecision::RejectedPerCallCap);
        // Per-call cap is checked first even if participant cap would also fail.
        assert_eq!(
            decide(1_000_000, 100, 499, 500),
            CapDecision::RejectedPerCallCap
        );
    }

    #[test]
    fn rejects_payment_that_would_exceed_participant_cap() {
        // Under per-call but pushes cumulative over.
        assert_eq!(
            decide(60, 100, 450, 500),
            CapDecision::RejectedParticipantCap
        );
        // Exactly at the cap is allowed (the strict > is intentional).
        assert_eq!(decide(50, 100, 450, 500), CapDecision::Allowed);
    }

    #[test]
    fn participant_cap_check_does_not_overflow() {
        // saturating_add prevents wrap-around if amount+already overflows u64.
        assert_eq!(
            decide(1, 100, u64::MAX, 500),
            CapDecision::RejectedParticipantCap
        );
    }

    #[test]
    fn zero_amount_is_allowed_when_caps_arent_zero() {
        // The route validates non-empty invoice; a 0-sat invoice is
        // unusual but cap logic shouldn't care.
        assert_eq!(decide(0, 100, 0, 500), CapDecision::Allowed);
    }
}

