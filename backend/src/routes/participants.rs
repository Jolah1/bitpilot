use axum::{
    extract::{Extension, Path, State},
    middleware::from_fn_with_state,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{generate_token, require_facilitator, require_participant, AuthedParticipant};
use crate::error::AppError;
use crate::models::{now, Participant, Session};
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
/// `GET /:id` requires the participant's own bearer token.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new().route("/", post(join_session));
    let authed = Router::new()
        .route("/me", get(get_self))
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
    let facilitator_token = generate_token();
    let created_at = now() as i64;

    sqlx::query(
        "INSERT INTO sessions (id, name, facilitator_token, created_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&facilitator_token)
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
    total_sats_distributed: u64,
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
    let total_sats: u64 = participants.iter().map(|p| p.sats_earned).sum();
    let participant_ids = participants.iter().map(|p| p.id.clone()).collect();

    Ok(Json(SessionResponse {
        session: Session {
            id: row.0,
            name: row.1,
            participant_ids,
            created_at: row.2 as u64,
        },
        participant_count: participants.len(),
        total_sats_distributed: total_sats,
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
    Ok(Json(load_participants_by_session(&state, &session_id).await?))
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
    let auth_token = generate_token();
    let created_at = now() as i64;

    sqlx::query(
        "INSERT INTO participants \
         (id, name, session_id, current_mission, sats_earned, nostr_pubkey, auth_token, created_at) \
         VALUES (?, ?, ?, 1, 0, NULL, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&body.session_id)
    .bind(&auth_token)
    .bind(created_at)
    .execute(&state.db)
    .await?;

    Ok(Json(JoinSessionResponse {
        participant: Participant {
            id,
            name: name.to_string(),
            session_id: body.session_id,
            current_mission: 1,
            completed_missions: vec![],
            sats_earned: 0,
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

// ── Loaders ──────────────────────────────────────────────────────────────

/// Load one participant by id, joining `mission_completions` for the
/// completed_missions vec. Returns `AppError::NotFound` if no such row.
pub async fn load_participant(
    state: &AppState,
    participant_id: &str,
) -> Result<Participant, AppError> {
    let row: Option<(String, String, String, i64, i64, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, sats_earned, nostr_pubkey \
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
        sats_earned: row.4 as u64,
        nostr_pubkey: row.5,
        completed_missions: completed.into_iter().map(|(m,)| m as u8).collect(),
    })
}

async fn load_participants_by_session(
    state: &AppState,
    session_id: &str,
) -> Result<Vec<Participant>, AppError> {
    let rows: Vec<(String, String, String, i64, i64, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, sats_earned, nostr_pubkey \
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
            sats_earned: r.4 as u64,
            nostr_pubkey: r.5,
            completed_missions: completed.into_iter().map(|(m,)| m as u8).collect(),
        });
    }
    Ok(out)
}
