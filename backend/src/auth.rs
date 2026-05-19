//! Bearer-token auth middleware.
//!
//! Tokens are 32 cryptographically-random bytes, hex-encoded (64 chars). They
//! are issued exactly once by `POST /api/participants` and stored in SQLite.
//! Subsequent requests prove identity by sending `Authorization: Bearer <token>`.

use axum::{
    body::Body,
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use rand::RngCore;
use std::sync::Arc;

use crate::error::AppError;
use crate::state::AppState;

/// Injected into request extensions once auth has succeeded. Downstream
/// handlers pull this with `Extension<AuthedParticipant>` to learn *which*
/// participant the request belongs to — they must never trust an id from
/// the URL or request body.
#[derive(Clone, Debug)]
pub struct AuthedParticipant {
    pub participant_id: String,
}

/// Per-participant bearer-token middleware. Rejects with 401 if the header
/// is missing/malformed, or if the token doesn't resolve to a real row.
pub async fn require_participant(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
        .ok_or(AppError::Unauthorized)?;

    if token.is_empty() {
        return Err(AppError::Unauthorized);
    }

    // O(log n) indexed lookup. The `auth_token` column has a UNIQUE index.
    let row: Option<(String,)> =
        sqlx::query_as("SELECT id FROM participants WHERE auth_token = ?")
            .bind(&token)
            .fetch_optional(&state.db)
            .await?;

    let participant_id = row.ok_or(AppError::Unauthorized)?.0;

    req.extensions_mut()
        .insert(AuthedParticipant { participant_id });
    Ok(next.run(req).await)
}

/// Facilitator-only middleware. Accepts a request if **either**:
///   - the `X-Facilitator-Key` header matches the global `FACILITATOR_KEY`
///     env var (single-tenant deploys), or
///   - the header matches a `sessions.facilitator_token` row in the DB
///     (multi-tenant: each session has its own facilitator token).
///
/// In dev with neither env var nor matching session token, the request is
/// rejected. There is no "open by default" path.
pub async fn require_facilitator(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let provided = req
        .headers()
        .get("x-facilitator-key")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.trim().to_string())
        .ok_or(AppError::Forbidden)?;

    if provided.is_empty() {
        return Err(AppError::Forbidden);
    }

    // 1. Global env-configured master key (optional).
    if let Some(expected) = std::env::var("FACILITATOR_KEY")
        .ok()
        .filter(|s| !s.is_empty())
    {
        if ct_eq(provided.as_bytes(), expected.as_bytes()) {
            return Ok(next.run(req).await);
        }
    }

    // 2. Per-session facilitator token in the DB.
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM sessions WHERE facilitator_token = ?",
    )
    .bind(&provided)
    .fetch_optional(&state.db)
    .await?;

    if row.is_some() {
        Ok(next.run(req).await)
    } else {
        Err(AppError::Forbidden)
    }
}

/// Constant-time byte-string equality. Returns false if lengths differ
/// (the length of the expected value is not itself a secret).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Generate a cryptographically-random 32-byte token, hex-encoded (64 chars).
///
/// Uses `OsRng`, which delegates to the OS CSPRNG (`getrandom` on Linux).
/// This is the only acceptable source for security tokens.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
