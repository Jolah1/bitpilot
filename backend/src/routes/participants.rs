use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::error::AppError;
use crate::models::{Participant, Session};
use crate::state::AppState;

// /api/sessions routes
pub fn sessions_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", post(create_session))
        .route("/:id", get(get_session))
        .route("/:id/participants", get(list_participants))
}

// /api/participants routes
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", post(join_session))
        .route("/:id", get(get_participant))
}

#[derive(Deserialize)]
struct CreateSessionRequest { name: String }

async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateSessionRequest>,
) -> Result<Json<Session>, AppError> {
    let session = Session::new(&body.name);
    state.sessions.lock().unwrap().insert(session.id.clone(), session.clone());
    Ok(Json(session))
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
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or(AppError::NotFound)?.clone();
    drop(sessions);
    let participants = state.participants.lock().unwrap();
    let session_participants: Vec<&Participant> = session
        .participant_ids.iter()
        .filter_map(|pid| participants.get(pid))
        .collect();
    let total_sats = session_participants.iter().map(|p| p.sats_earned).sum();
    Ok(Json(SessionResponse {
        participant_count: session_participants.len(),
        total_sats_distributed: total_sats,
        session,
    }))
}

async fn list_participants(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<Vec<Participant>>, AppError> {
    let sessions = state.sessions.lock().unwrap();
    let ids = sessions.get(&session_id).ok_or(AppError::NotFound)?.participant_ids.clone();
    drop(sessions);
    let participants = state.participants.lock().unwrap();
    let result = ids.iter().filter_map(|id| participants.get(id).cloned()).collect();
    Ok(Json(result))
}

#[derive(Deserialize)]
struct JoinSessionRequest { name: String, session_id: String }

async fn join_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<JoinSessionRequest>,
) -> Result<Json<Participant>, AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    let participant = Participant::new(&body.name, &body.session_id);

    // Hold the sessions lock for the entire check-then-mutate so the session
    // can't disappear between verifying it exists and pushing the new
    // participant id into it.
    {
        let mut sessions = state.sessions.lock().unwrap();
        let session = sessions
            .get_mut(&body.session_id)
            .ok_or(AppError::NotFound)?;
        session.participant_ids.push(participant.id.clone());
    }

    state
        .participants
        .lock()
        .unwrap()
        .insert(participant.id.clone(), participant.clone());

    Ok(Json(participant))
}

async fn get_participant(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Participant>, AppError> {
    let participants = state.participants.lock().unwrap();
    let p = participants.get(&id).ok_or(AppError::NotFound)?.clone();
    Ok(Json(p))
}
