//! Bearer-token auth middleware.
//!
//! Tokens are 32 cryptographically-random bytes, hex-encoded (64 chars).
//! They are issued exactly once by `POST /api/sessions` and
//! `POST /api/participants` and returned to the caller in the response body.
//!
//! The database stores only `SHA-256(token)` (also hex-encoded, also 64
//! chars). On every authed request the middleware hashes the incoming
//! bearer and looks the *hash* up. The plaintext token therefore exists in
//! exactly two places: in transit (TLS-encrypted in prod) and in the
//! caller's own storage (sessionStorage on the frontend). It is never on
//! disk on the server.
//!
//! SHA-256 with no salt is appropriate here because the input has 256 bits
//! of entropy from `OsRng`, putting it well beyond brute-force or
//! rainbow-table reach. Salting / argon2 would add cost without buying
//! security against the threat we care about (DB-at-rest disclosure).

use axum::{
    body::Body,
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use rand::RngCore;
use sha2::{Digest, Sha256};
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
/// is missing/malformed, or if the hashed token doesn't resolve to a row.
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

    let hash = hash_token(&token);

    // O(log n) indexed lookup on the unique `auth_token_hash` column.
    let row: Option<(String,)> =
        sqlx::query_as("SELECT id FROM participants WHERE auth_token_hash = ?")
            .bind(&hash)
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
///   - the hash of the header matches a `sessions.facilitator_token_hash`
///     row in the DB (multi-tenant: each session has its own facilitator
///     token).
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

    // 1. Global env-configured master key (optional). Not stored in the DB
    //    — it lives in process env — so we compare in plaintext with a
    //    constant-time check.
    if let Some(expected) = std::env::var("FACILITATOR_KEY")
        .ok()
        .filter(|s| !s.is_empty())
    {
        if ct_eq(provided.as_bytes(), expected.as_bytes()) {
            return Ok(next.run(req).await);
        }
    }

    // 2. Per-session facilitator token: hash the header value and look up
    //    by hash. The DB only ever holds the hash.
    let hash = hash_token(&provided);
    let row: Option<(String,)> =
        sqlx::query_as("SELECT id FROM sessions WHERE facilitator_token_hash = ?")
            .bind(&hash)
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
/// This is the only acceptable source for security tokens. Callers must
/// pair this with `hash_token` for storage — the plaintext is for the
/// caller only.
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Generate a short, human-typeable one-time pairing code: 8 Crockford
/// base32 chars (alphabet excludes I, L, O, U to avoid confusion), giving
/// ~2^40 of entropy. Unguessable in practice given the short expiry, the
/// single-use redemption, and the per-IP rate limiter, while still easy to
/// read aloud or type from one device to another. Returned ungrouped; the
/// UI adds a dash for display and normalizes it back on redeem.
pub fn generate_pairing_code() -> String {
    const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut bytes = [0u8; 8];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| ALPHABET[(b & 0x1f) as usize] as char).collect()
}

/// Normalize a pairing code as typed: uppercase, and strip anything that is
/// not an alphanumeric (spaces, dashes). Lets the UI show `XXXX-XXXX` and
/// accept sloppy input without affecting the stored value.
pub fn normalize_pairing_code(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// SHA-256 of the token, hex-encoded. Stable across processes and platforms;
/// safe to store and to index on. Inputs always have 256 bits of CSPRNG
/// entropy, so no salt is required.
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
