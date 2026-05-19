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

/// All Lightning + Nostr write endpoints require the participant's bearer
/// token. The participant_id is read from the token, not from the request
/// body — body-supplied ids were the source of audit issue #1.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/invoice", post(create_invoice))
        .route("/pay", post(pay_invoice))
        .route("/nostr/identity", post(create_nostr_identity))
        .route("/nostr/publish", post(publish_nostr_note))
        .layer(from_fn_with_state(state, require_participant))
}

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

    // Record in the proof ledger so mission #2 can verify completion.
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
    }))
}

#[derive(Serialize)]
struct IdentityResponse {
    npub: String,
    nsec: String,
    participant_id: String,
    warning: String,
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
        // TODO(audit #5): once we switch to real keys, generate them
        // client-side and stop returning nsec over the wire.
        warning: "Store your nsec safely — it IS your identity. Never share it.".into(),
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
    }))
}
