use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::AppError;
use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/invoice", post(create_invoice))
        .route("/pay", post(pay_invoice))
        .route("/nostr/identity", post(create_nostr_identity))
        .route("/nostr/publish", post(publish_nostr_note))
}

#[derive(Deserialize)]
struct CreateInvoiceRequest { participant_id: String, amount_sats: u64, description: String }

#[derive(Serialize)]
struct InvoiceResponse { invoice: String, participant_id: String, amount_sats: u64 }

async fn create_invoice(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateInvoiceRequest>,
) -> Result<Json<InvoiceResponse>, AppError> {
    let invoice = state.lightning.create_invoice(body.amount_sats, &body.description).await?;
    Ok(Json(InvoiceResponse { invoice, participant_id: body.participant_id, amount_sats: body.amount_sats }))
}

#[derive(Deserialize)]
struct PayInvoiceRequest { participant_id: String, invoice: String }

#[derive(Serialize)]
struct PaymentResponse { payment_hash: String, participant_id: String, status: String }

async fn pay_invoice(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PayInvoiceRequest>,
) -> Result<Json<PaymentResponse>, AppError> {
    let payment_hash = state.lightning.pay_invoice(&body.invoice).await?;
    Ok(Json(PaymentResponse { payment_hash, participant_id: body.participant_id, status: "paid".into() }))
}

#[derive(Deserialize)]
struct CreateIdentityRequest { participant_id: String }

#[derive(Serialize)]
struct IdentityResponse { npub: String, nsec: String, participant_id: String, warning: String }

async fn create_nostr_identity(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateIdentityRequest>,
) -> Result<Json<IdentityResponse>, AppError> {
    let (npub, nsec) = state.nostr.generate_keypair().await?;
    if let Some(p) = state.participants.lock().unwrap().get_mut(&body.participant_id) {
        p.nostr_pubkey = Some(npub.clone());
    }
    Ok(Json(IdentityResponse { npub, nsec, participant_id: body.participant_id, warning: "Store your nsec safely — it IS your identity. Never share it.".into() }))
}

#[derive(Deserialize)]
struct PublishNoteRequest { participant_id: String, content: String, nsec: String }

#[derive(Serialize)]
struct PublishNoteResponse { event_id: String, participant_id: String, status: String }

async fn publish_nostr_note(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PublishNoteRequest>,
) -> Result<Json<PublishNoteResponse>, AppError> {
    let event_id = state.nostr.publish_note(&body.nsec, &body.content).await?;
    Ok(Json(PublishNoteResponse { event_id, participant_id: body.participant_id, status: "published".into() }))
}