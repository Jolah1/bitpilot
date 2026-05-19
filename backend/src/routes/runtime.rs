use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use std::sync::Arc;

use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/runtime", get(runtime_info))
}

/// `GET /api/runtime` — tells the frontend which backend services are live
/// vs simulated, so the UI can be honest about it.
///
/// `lightning_real` is true when LNbits is configured; `ecash_real` is true
/// when the Cashu mint connection succeeded at boot; `nostr` is always
/// real (always publishes to public relays via nostr-sdk).
#[derive(Serialize)]
struct RuntimeInfo {
    lightning_real: bool,
    ecash_real: bool,
    /// Mint URL the eCash service is configured to use.
    ecash_mint_url: String,
    /// Public relays the Nostr service publishes to.
    nostr_relays: Vec<String>,
}

async fn runtime_info(State(state): State<Arc<AppState>>) -> Json<RuntimeInfo> {
    Json(RuntimeInfo {
        lightning_real: !state.lightning.simulated,
        ecash_real: !state.ecash.simulated,
        ecash_mint_url: state.ecash.mint_url.clone(),
        nostr_relays: state.nostr.relays().to_vec(),
    })
}
