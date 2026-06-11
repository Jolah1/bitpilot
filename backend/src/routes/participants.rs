use axum::{
    extract::{Extension, Path, State},
    middleware::from_fn_with_state,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{
    generate_token, hash_token, require_facilitator, require_participant, AuthedParticipant,
};
use crate::error::AppError;
use crate::models::{now, Badge, Participant, Session};
use crate::state::AppState;

/// `/api/sessions` — facilitator-side routes. `POST /` is open (anyone can
/// create a session; rate limiting controls abuse). The read endpoints
/// require the facilitator token returned at creation time.
pub fn sessions_router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    // Public: create a session.
    let public = Router::new().route("/", post(create_session));
    // Facilitator-gated reads.
    let admin = Router::new()
        .route("/:id", get(get_session))
        .route("/:id/participants", get(list_participants))
        .layer(from_fn_with_state(state, require_facilitator));
    public.merge(admin)
}

/// `/api/participants` — learner-side. `POST /` is open (joining a session
/// requires only knowing the session id, which the facilitator shares).
/// `GET /me` and `GET /me/completions` require the participant's own bearer token.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new().route("/", post(join_session));
    let authed = Router::new()
        .route("/me", get(get_self))
        .route("/me/completions", get(list_completions))
        .route("/me/badges", get(list_badges))
        .layer(from_fn_with_state(state, require_participant));
    public.merge(authed)
}

#[derive(Deserialize)]
struct CreateSessionRequest {
    name: String,
}

#[derive(Serialize)]
struct CreateSessionResponse {
    session: Session,
    /// Returned exactly once. Facilitator stores this and sends it as
    /// `X-Facilitator-Key` on subsequent admin requests.
    facilitator_token: String,
}

async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, AppError> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if name.len() > 120 {
        return Err(AppError::BadRequest("name too long (max 120 chars)".into()));
    }

    let id = Uuid::new_v4().to_string();
    // Plaintext is returned to the caller exactly once below. The DB only
    // ever sees the hash — see auth::hash_token for the rationale.
    let facilitator_token = generate_token();
    let facilitator_hash = hash_token(&facilitator_token);
    let created_at = now() as i64;

    sqlx::query(
        "INSERT INTO sessions (id, name, facilitator_token_hash, created_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&facilitator_hash)
    .bind(created_at)
    .execute(&state.db)
    .await?;

    Ok(Json(CreateSessionResponse {
        session: Session {
            id,
            name: name.to_string(),
            participant_ids: vec![],
            created_at: created_at as u64,
        },
        facilitator_token,
    }))
}

#[derive(Serialize)]
struct SessionResponse {
    session: Session,
    participant_count: usize,
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<SessionResponse>, AppError> {
    let row: (String, String, i64) =
        sqlx::query_as("SELECT id, name, created_at FROM sessions WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;

    let participants = load_participants_by_session(&state, &id).await?;
    let participant_ids = participants.iter().map(|p| p.id.clone()).collect();

    Ok(Json(SessionResponse {
        session: Session {
            id: row.0,
            name: row.1,
            participant_ids,
            created_at: row.2 as u64,
        },
        participant_count: participants.len(),
    }))
}

async fn list_participants(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<Vec<Participant>>, AppError> {
    // Ensure the session exists so we don't silently return [] for typos.
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM sessions WHERE id = ?")
        .bind(&session_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }
    Ok(Json(
        load_participants_by_session(&state, &session_id).await?,
    ))
}

#[derive(Deserialize)]
struct JoinSessionRequest {
    name: String,
    session_id: String,
}

#[derive(Serialize)]
struct JoinSessionResponse {
    participant: Participant,
    /// Returned exactly once. The frontend stores this in sessionStorage
    /// and sends it as `Authorization: Bearer <token>` on every authed
    /// request. If lost, the participant must rejoin.
    auth_token: String,
}

async fn join_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<JoinSessionRequest>,
) -> Result<Json<JoinSessionResponse>, AppError> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    if name.len() > 80 {
        return Err(AppError::BadRequest("name too long (max 80 chars)".into()));
    }

    // Verify the session exists before issuing a token; otherwise we'd be
    // happy to mint tokens for nonexistent sessions.
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM sessions WHERE id = ?")
        .bind(&body.session_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let id = Uuid::new_v4().to_string();
    // Plaintext token returned in the response below; only the SHA-256
    // hash is persisted. See auth::hash_token.
    let auth_token = generate_token();
    let auth_hash = hash_token(&auth_token);
    let created_at = now() as i64;

    // New curriculum is 0-indexed; we explicitly bind 0 to be robust if
    // the column's default ever drifts in a future migration.
    sqlx::query(
        "INSERT INTO participants \
         (id, name, session_id, current_mission, nostr_pubkey, auth_token_hash, created_at) \
         VALUES (?, ?, ?, 0, NULL, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&body.session_id)
    .bind(&auth_hash)
    .bind(created_at)
    .execute(&state.db)
    .await?;

    Ok(Json(JoinSessionResponse {
        participant: Participant {
            id,
            name: name.to_string(),
            session_id: body.session_id,
            current_mission: 0,
            completed_missions: vec![],
            nostr_pubkey: None,
        },
        auth_token,
    }))
}

/// `GET /api/participants/me` — authenticated read of the calling
/// participant's row. Replaces the old `GET /api/participants/:id` which
/// trusted the URL.
async fn get_self(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<Participant>, AppError> {
    let p = load_participant(&state, &authed.participant_id).await?;
    Ok(Json(p))
}

/// One completed-mission record returned by the proof-archive endpoint.
///
/// `proof` is whatever artifact the verifier accepted at completion time:
/// an npub (mission 14), bolt11 invoice (23), payment hash (24), Nostr
/// event id (26/27/30/36), Cashu token (33/34), signet txid (42), or
/// the literal "acknowledged" for knowledge-only missions. The UI is
/// expected to render different shapes per `mission` number.
#[derive(Serialize)]
struct CompletionRecord {
    mission: u8,
    proof: String,
    completed_at: i64,
}

/// `GET /api/participants/me/completions` — proof archive for the calling
/// participant. Sorted by mission number ascending so the UI can render
/// it without re-sorting. Empty array if nothing's been completed yet.
async fn list_completions(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<Vec<CompletionRecord>>, AppError> {
    let rows: Vec<(i64, Option<String>, i64)> = sqlx::query_as(
        "SELECT mission, proof, completed_at \
         FROM mission_completions \
         WHERE participant_id = ? \
         ORDER BY mission",
    )
    .bind(&authed.participant_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(m, p, t)| CompletionRecord {
                mission: m as u8,
                // `proof` was made NULLable in the schema for forward
                // compatibility; we always write something today so this
                // default is mostly defensive.
                proof: p.unwrap_or_default(),
                completed_at: t,
            })
            .collect(),
    ))
}

/// `GET /api/participants/me/badges` — one tier badge per learning band
/// (Novice → Captain). Derived from `mission_completions`; no badge table.
/// Always returns exactly 5 entries in tier order.
async fn list_badges(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<Vec<Badge>>, AppError> {
    let rows: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT mission, completed_at FROM mission_completions WHERE participant_id = ?",
    )
    .bind(&authed.participant_id)
    .fetch_all(&state.db)
    .await?;
    let completions: Vec<(u8, i64)> = rows.into_iter().map(|(m, t)| (m as u8, t)).collect();
    Ok(Json(Badge::all_for(&completions)))
}

// ── Loaders ──────────────────────────────────────────────────────────────

/// Load one participant by id, joining `mission_completions` for the
/// completed_missions vec. Returns `AppError::NotFound` if no such row.
pub async fn load_participant(
    state: &AppState,
    participant_id: &str,
) -> Result<Participant, AppError> {
    let row: Option<(String, String, String, i64, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, nostr_pubkey \
         FROM participants WHERE id = ?",
    )
    .bind(participant_id)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or(AppError::NotFound)?;

    let completed: Vec<(i64,)> = sqlx::query_as(
        "SELECT mission FROM mission_completions WHERE participant_id = ? ORDER BY mission",
    )
    .bind(participant_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Participant {
        id: row.0,
        name: row.1,
        session_id: row.2,
        current_mission: row.3 as u8,
        nostr_pubkey: row.4,
        completed_missions: completed.into_iter().map(|(m,)| m as u8).collect(),
    })
}

async fn load_participants_by_session(
    state: &AppState,
    session_id: &str,
) -> Result<Vec<Participant>, AppError> {
    let rows: Vec<(String, String, String, i64, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, nostr_pubkey \
         FROM participants WHERE session_id = ? ORDER BY created_at",
    )
    .bind(session_id)
    .fetch_all(&state.db)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        // For each participant, load their completed missions. This is N+1
        // queries; fine for a classroom-sized app (small N). If this ever
        // becomes hot, switch to a single GROUP_CONCAT or two-query JOIN.
        let completed: Vec<(i64,)> = sqlx::query_as(
            "SELECT mission FROM mission_completions WHERE participant_id = ? ORDER BY mission",
        )
        .bind(&r.0)
        .fetch_all(&state.db)
        .await?;

        out.push(Participant {
            id: r.0,
            name: r.1,
            session_id: r.2,
            current_mission: r.3 as u8,
            nostr_pubkey: r.4,
            completed_missions: completed.into_iter().map(|(m,)| m as u8).collect(),
        });
    }
    Ok(out)
}
