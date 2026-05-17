use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::AppError;
use crate::models::{Mission, Participant};
use crate::state::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_missions))
        .route("/:participant_id/complete", post(complete_mission))
}

async fn list_missions() -> Json<Vec<Mission>> {
    Json(Mission::all())
}

#[derive(Deserialize)]
struct CompleteMissionRequest {
    mission: u8,
    proof: Option<String>,
}

#[derive(Serialize)]
struct CompleteMissionResponse {
    participant: Participant,
    sats_earned: u64,
    next_mission: Option<u8>,
}

async fn complete_mission(
    State(state): State<Arc<AppState>>,
    Path(participant_id): Path<String>,
    Json(body): Json<CompleteMissionRequest>,
) -> Result<Json<CompleteMissionResponse>, AppError> {
    let mut participants = state.participants.lock().unwrap();
    let p = participants.get_mut(&participant_id).ok_or(AppError::NotFound)?;

    if !p.is_current_mission(body.mission) {
        return Err(AppError::BadRequest("Not your current mission".into()));
    }
    if p.has_completed(body.mission) {
        return Err(AppError::BadRequest("Mission already completed".into()));
    }

    let reward = Mission::reward(body.mission);
    p.completed_missions.push(body.mission);
    p.sats_earned += reward;

    let next_mission = if body.mission < 5 {
        p.current_mission = body.mission + 1;
        Some(body.mission + 1)
    } else {
        None
    };

    Ok(Json(CompleteMissionResponse {
        participant: p.clone(),
        sats_earned: reward,
        next_mission,
    }))
}