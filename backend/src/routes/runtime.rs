use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::sync::Arc;

use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/runtime", get(runtime_info))
}

/// `GET /api/runtime` — tells the frontend which backend services are
/// actually live vs mocked, so the UI can be honest about it.
///
/// Today both Lightning and Nostr are mocked unconditionally. Once a real
/// LNbits/LDK service or real Nostr publishing is wired up, these flags
/// will be derived from configuration (e.g., `LNBITS_URL` set).
#[derive(Serialize)]
struct RuntimeInfo {
    lightning_real: bool,
    ecash_real: bool,
    nostr_real: bool,
}

async fn runtime_info() -> Json<RuntimeInfo> {
    Json(RuntimeInfo {
        lightning_real: false,
        ecash_real: false,
        nostr_real: false,
    })
}
