use axum::{
    extract::{Extension, State},
    middleware::from_fn_with_state,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::{require_participant, AuthedParticipant};
use crate::error::AppError;
use crate::models::now;
use crate::state::AppState;

/// All Lightning, Nostr, and eCash endpoints require the participant's
/// bearer token. The participant_id is read from the token, not from the
/// request body. Every response carries `simulated: bool` so the UI can
/// render an honest "Simulated" badge.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/invoice", post(create_invoice))
        .route("/pay", post(pay_invoice))
        .route("/nostr/identity", post(create_nostr_identity))
        .route("/nostr/publish", post(publish_nostr_note))
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
    let payment_hash = state.lightning.pay_invoice(&body.invoice).await?;

    sqlx::query(
        "INSERT INTO lightning_log (kind, artifact, participant_id, amount_sats, created_at) \
         VALUES ('payment', ?, ?, 0, ?)",
    )
    .bind(&payment_hash)
    .bind(&authed.participant_id)
    .bind(now() as i64)
    .execute(&state.db)
    .await?;

    Ok(Json(PaymentResponse {
        payment_hash,
        participant_id: authed.participant_id,
        status: "paid".into(),
        simulated: state.lightning.simulated,
    }))
}

// ── Nostr ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct IdentityResponse {
    npub: String,
    nsec: String,
    participant_id: String,
    warning: String,
    /// Always `false` — keys are real secp256k1, bech32-encoded.
    simulated: bool,
}

async fn create_nostr_identity(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<IdentityResponse>, AppError> {
    let (npub, nsec) = state.nostr.generate_keypair().await?;

    sqlx::query("UPDATE participants SET nostr_pubkey = ? WHERE id = ?")
        .bind(&npub)
        .bind(&authed.participant_id)
        .execute(&state.db)
        .await?;

    Ok(Json(IdentityResponse {
        npub,
        nsec,
        participant_id: authed.participant_id,
        // TODO(audit #5): once we switch to client-side key generation,
        // stop returning nsec over the wire. The UI session pre-emptively
        // labels this as simulated=false because the *keys* are real
        // secp256k1; the *custody model* is what's wrong.
        warning: "Store your nsec safely — it IS your identity. Never share it.".into(),
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

    sqlx::query(
        "INSERT INTO nostr_log (event_id, participant_id, created_at) VALUES (?, ?, ?)",
    )
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
