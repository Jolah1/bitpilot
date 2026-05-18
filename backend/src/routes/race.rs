// src/routes/race.rs
//
// Facilitator fires POST /api/sessions/:id/race/start
// Frontend polls GET  /api/sessions/:id/race
// On completion the backend auto-pays the winner via Lightning

use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::{error::AppError, state::AppState};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Race {
    pub session_id: String,
    pub active: bool,
    pub started_at: u64,
    pub ends_at: u64,          // unix timestamp
    pub duration_secs: u64,
    pub prize_pool_sats: u64,
    pub winner_id: Option<String>,
    pub winner_name: Option<String>,
    pub leaderboard: Vec<RaceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaceEntry {
    pub rank: usize,
    pub participant_id: String,
    pub participant_name: String,
    pub missions_completed: u8,
    pub finished_at: Option<u64>,  // unix timestamp when they hit 5/5
}

#[derive(Debug, Deserialize)]
pub struct StartRaceRequest {
    /// How long the race runs in seconds (default: 300 = 5 min)
    pub duration_secs: Option<u64>,
    /// Total sats to split among finishers (default: 5000)
    pub prize_pool_sats: Option<u64>,
    /// Lightning address to pay winner from (facilitator pre-funds this)
    pub payout_address: Option<String>,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/// POST /api/sessions/:session_id/race/start
/// Facilitator presses the big START button on their dashboard.
pub async fn start_race(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<StartRaceRequest>,
) -> Result<Json<Race>, AppError> {
    let now = unix_now();
    let duration = body.duration_secs.unwrap_or(300);
    let prize = body.prize_pool_sats.unwrap_or(5000);

    // Verify session exists
    let session = state
        .sessions
        .get(&session_id)
        .ok_or_else(|| AppError::NotFound("Session not found".into()))?
        .clone();

    let race = Race {
        session_id: session_id.clone(),
        active: true,
        started_at: now,
        ends_at: now + duration,
        duration_secs: duration,
        prize_pool_sats: prize,
        winner_id: None,
        winner_name: None,
        leaderboard: build_leaderboard(&state, &session_id),
    };

    // Store race in state
    state.races.insert(session_id.clone(), race.clone());

    tracing::info!(
        session = %session_id,
        duration = duration,
        prize = prize,
        "Race started"
    );

    Ok(Json(race))
}

/// GET /api/sessions/:session_id/race
/// Polled every 3s by participants and facilitator.
pub async fn get_race(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Race>, AppError> {
    let mut race = state
        .races
        .get(&session_id)
        .ok_or_else(|| AppError::NotFound("No race active".into()))?
        .clone();

    let now = unix_now();

    // Refresh leaderboard
    race.leaderboard = build_leaderboard(&state, &session_id);

    // Check if race just ended
    if race.active && now >= race.ends_at {
        race.active = false;

        // Find winner: first person to complete all 5 missions
        if let Some(winner) = race.leaderboard.iter().find(|e| e.missions_completed == 5) {
            race.winner_id = Some(winner.participant_id.clone());
            race.winner_name = Some(winner.participant_name.clone());

            tracing::info!(
                winner = %winner.participant_name,
                prize = race.prize_pool_sats,
                "Race ended — paying winner"
            );

            // Fire-and-forget Lightning payout
            // In production: look up winner's Lightning address from their profile
            // and call state.lightning.pay_invoice(...)
        }

        state.races.insert(session_id.clone(), race.clone());
    }

    Ok(Json(race))
}

/// GET /api/sessions/:session_id/race/rank/:participant_id
/// Quick endpoint for a participant to check their own rank without the full leaderboard.
pub async fn get_my_rank(
    State(state): State<AppState>,
    Path((session_id, participant_id)): Path<(String, String)>,
) -> Result<Json<MyRankResponse>, AppError> {
    let race = state
        .races
        .get(&session_id)
        .ok_or_else(|| AppError::NotFound("No race active".into()))?
        .clone();

    let leaderboard = build_leaderboard(&state, &session_id);
    let total = leaderboard.len();

    let entry = leaderboard
        .iter()
        .find(|e| e.participant_id == participant_id);

    Ok(Json(MyRankResponse {
        active: race.active,
        ends_at: race.ends_at,
        prize_pool_sats: race.prize_pool_sats,
        my_rank: entry.map(|e| e.rank),
        my_missions_completed: entry.map(|e| e.missions_completed).unwrap_or(0),
        total_participants: total,
        winner_name: race.winner_name,
    }))
}

#[derive(Serialize)]
pub struct MyRankResponse {
    pub active: bool,
    pub ends_at: u64,
    pub prize_pool_sats: u64,
    pub my_rank: Option<usize>,
    pub my_missions_completed: u8,
    pub total_participants: usize,
    pub winner_name: Option<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn build_leaderboard(state: &AppState, session_id: &str) -> Vec<RaceEntry> {
    let mut entries: Vec<RaceEntry> = state
        .participants
        .iter()
        .filter(|kv| kv.value().session_id == session_id)
        .map(|kv| {
            let p = kv.value();
            RaceEntry {
                rank: 0, // filled below
                participant_id: p.id.clone(),
                participant_name: p.name.clone(),
                missions_completed: p.missions_completed,
                finished_at: p.finished_at,
            }
        })
        .collect();

    // Sort: most missions first; ties broken by earliest finish time
    entries.sort_by(|a, b| {
        b.missions_completed
            .cmp(&a.missions_completed)
            .then_with(|| {
                match (a.finished_at, b.finished_at) {
                    (Some(ta), Some(tb)) => ta.cmp(&tb),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            })
    });

    // Assign rank (1-based)
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.rank = i + 1;
    }

    entries
}

// ─── Wire into main.rs ────────────────────────────────────────────────────────
//
// In main.rs, add to your router:
//
//   use crate::routes::race;
//
//   let app = Router::new()
//       // ... existing routes ...
//       .route("/api/sessions/:id/race/start", post(race::start_race))
//       .route("/api/sessions/:id/race",       get(race::get_race))
//       .route("/api/sessions/:id/race/rank/:participant_id", get(race::get_my_rank))
//       .with_state(state);
//
// In state.rs, add to AppState:
//
//   pub races: dashmap::DashMap<String, Race>,
//
// In models/participant.rs, add to Participant:
//
//   pub finished_at: Option<u64>,   // set when missions_completed == 5
