use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{generate_token, hash_token};
use crate::error::AppError;
use crate::models::{now, Mission};
use crate::state::AppState;

/// `/api/challenges` — weekly community challenges (issue #58).
///
/// A challenge wraps a normal session: participants join it through the
/// ordinary join flow (the frontend links to `?session=<id>`), missions are
/// completed in the ordinary learner view, and the results endpoint ranks
/// completions of the challenge's mission subset inside its time window.
///
/// Trust model mirrors sessions: `POST /` is open (rate limiting controls
/// abuse, exactly as for session creation) and returns the facilitator
/// token for the backing session so the creator can watch the live
/// dashboard. The list and results endpoints are public and read-only —
/// they expose participant display names only, never ids or tokens.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", post(create_challenge).get(list_challenges))
        .route("/:id/results", get(challenge_results))
}

/// Public wire shape of a challenge. `status` is derived from the window
/// at request time so clients never have to compare clocks.
#[derive(Serialize)]
struct ChallengeInfo {
    id: String,
    session_id: String,
    title: String,
    blurb: String,
    missions: Vec<u8>,
    starts_at: i64,
    ends_at: i64,
    status: ChallengeStatus,
    participant_count: i64,
}

#[derive(Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum ChallengeStatus {
    Upcoming,
    Live,
    Ended,
}

fn status_for(starts_at: i64, ends_at: i64, now: i64) -> ChallengeStatus {
    if now < starts_at {
        ChallengeStatus::Upcoming
    } else if now <= ends_at {
        ChallengeStatus::Live
    } else {
        ChallengeStatus::Ended
    }
}

#[derive(Deserialize)]
struct CreateChallengeRequest {
    title: String,
    #[serde(default)]
    blurb: String,
    missions: Vec<u8>,
    starts_at: i64,
    ends_at: i64,
}

#[derive(Serialize)]
struct CreateChallengeResponse {
    challenge: ChallengeInfo,
    /// Facilitator token of the backing session, returned exactly once.
    /// Lets the creator open the live facilitator dashboard.
    facilitator_token: String,
}

async fn create_challenge(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateChallengeRequest>,
) -> Result<Json<CreateChallengeResponse>, AppError> {
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    if title.len() > 120 {
        return Err(AppError::BadRequest("title too long (max 120 chars)".into()));
    }
    let blurb = body.blurb.trim();
    if blurb.len() > 280 {
        return Err(AppError::BadRequest("blurb too long (max 280 chars)".into()));
    }
    if body.missions.is_empty() || body.missions.len() > 20 {
        return Err(AppError::BadRequest(
            "a challenge needs 1 to 20 missions".into(),
        ));
    }
    let mut missions = body.missions.clone();
    missions.sort_unstable();
    missions.dedup();
    if missions.len() != body.missions.len() {
        return Err(AppError::BadRequest("duplicate mission ids".into()));
    }
    if let Some(bad) = missions
        .iter()
        .find(|m| !(Mission::FIRST..=Mission::LAST).contains(m))
    {
        return Err(AppError::BadRequest(format!(
            "mission {bad} is out of range ({}..={})",
            Mission::FIRST,
            Mission::LAST
        )));
    }
    if body.ends_at <= body.starts_at {
        return Err(AppError::BadRequest(
            "the challenge must end after it starts".into(),
        ));
    }
    let now_s = now() as i64;
    if body.ends_at <= now_s {
        return Err(AppError::BadRequest(
            "the challenge window is already over".into(),
        ));
    }

    // Backing session, created exactly like POST /api/sessions would.
    let session_id = Uuid::new_v4().to_string();
    let facilitator_token = generate_token();
    let facilitator_hash = hash_token(&facilitator_token);
    let challenge_id = Uuid::new_v4().to_string();
    let missions_json = serde_json::to_string(&missions)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize missions: {e}")))?;

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO sessions (id, name, facilitator_token_hash, created_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(title)
    .bind(&facilitator_hash)
    .bind(now_s)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO challenges (id, session_id, title, blurb, missions, starts_at, ends_at, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&challenge_id)
    .bind(&session_id)
    .bind(title)
    .bind(blurb)
    .bind(&missions_json)
    .bind(body.starts_at)
    .bind(body.ends_at)
    .bind(now_s)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(CreateChallengeResponse {
        challenge: ChallengeInfo {
            id: challenge_id,
            session_id,
            title: title.to_string(),
            blurb: blurb.to_string(),
            missions,
            starts_at: body.starts_at,
            ends_at: body.ends_at,
            status: status_for(body.starts_at, body.ends_at, now_s),
            participant_count: 0,
        },
        facilitator_token,
    }))
}

/// `GET /api/challenges` — public list, newest window first, capped at 50.
async fn list_challenges(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ChallengeInfo>>, AppError> {
    let rows: Vec<(String, String, String, String, String, i64, i64, i64)> = sqlx::query_as(
        "SELECT c.id, c.session_id, c.title, c.blurb, c.missions, c.starts_at, c.ends_at, \
                (SELECT COUNT(*) FROM participants p WHERE p.session_id = c.session_id) \
         FROM challenges c \
         ORDER BY c.starts_at DESC \
         LIMIT 50",
    )
    .fetch_all(&state.db)
    .await?;

    let now_s = now() as i64;
    Ok(Json(
        rows.into_iter()
            .map(|r| ChallengeInfo {
                id: r.0,
                session_id: r.1,
                title: r.2,
                blurb: r.3,
                missions: serde_json::from_str(&r.4).unwrap_or_default(),
                starts_at: r.5,
                ends_at: r.6,
                status: status_for(r.5, r.6, now_s),
                participant_count: r.7,
            })
            .collect(),
    ))
}

/// One leaderboard row. Display name only — no participant id, no token
/// material. `cleared` counts distinct challenge missions completed inside
/// the window; `last_clear` is the timestamp of the latest qualifying
/// completion (the tiebreak: earlier finisher ranks higher).
#[derive(Serialize)]
struct ResultRow {
    name: String,
    cleared: usize,
    last_clear: Option<i64>,
}

#[derive(Serialize)]
struct ChallengeResultsResponse {
    challenge: ChallengeInfo,
    results: Vec<ResultRow>,
}

/// `GET /api/challenges/:id/results` — the public read-only leaderboard.
async fn challenge_results(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ChallengeResultsResponse>, AppError> {
    let row: (String, String, String, String, String, i64, i64) = sqlx::query_as(
        "SELECT id, session_id, title, blurb, missions, starts_at, ends_at \
         FROM challenges WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let missions: Vec<u8> = serde_json::from_str(&row.4).unwrap_or_default();
    let (starts_at, ends_at) = (row.5, row.6);

    // All (name, mission, completed_at) triples for the backing session in
    // one query; the subset/window filter and ranking happen in Rust.
    // Sessions are workshop-sized, so this stays trivially cheap.
    let participants: Vec<(String, String)> =
        sqlx::query_as("SELECT id, name FROM participants WHERE session_id = ?")
            .bind(&row.1)
            .fetch_all(&state.db)
            .await?;
    let completions: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT participant_id, mission, completed_at FROM mission_completions \
         WHERE participant_id IN (SELECT id FROM participants WHERE session_id = ?)",
    )
    .bind(&row.1)
    .fetch_all(&state.db)
    .await?;

    let mut results: Vec<ResultRow> = participants
        .into_iter()
        .map(|(pid, name)| {
            let mut cleared: Vec<i64> = completions
                .iter()
                .filter(|(cpid, m, at)| {
                    *cpid == pid
                        && u8::try_from(*m).map(|m| missions.contains(&m)).unwrap_or(false)
                        && (starts_at..=ends_at).contains(at)
                })
                .map(|(_, _, at)| *at)
                .collect();
            cleared.sort_unstable();
            ResultRow {
                name,
                cleared: cleared.len(),
                last_clear: cleared.last().copied(),
            }
        })
        .collect();

    // Most missions cleared first; among equals the earlier finisher wins;
    // stragglers with no qualifying completions sort by name for stability.
    results.sort_by(|a, b| {
        b.cleared
            .cmp(&a.cleared)
            .then_with(|| match (a.last_clear, b.last_clear) {
                (Some(x), Some(y)) => x.cmp(&y),
                _ => std::cmp::Ordering::Equal,
            })
            .then_with(|| a.name.cmp(&b.name))
    });

    let now_s = now() as i64;
    let participant_count = results.len() as i64;
    Ok(Json(ChallengeResultsResponse {
        challenge: ChallengeInfo {
            id: row.0,
            session_id: row.1,
            title: row.2,
            blurb: row.3,
            missions,
            starts_at,
            ends_at,
            status: status_for(starts_at, ends_at, now_s),
            participant_count,
        },
        results,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_follows_the_window() {
        assert!(status_for(100, 200, 50) == ChallengeStatus::Upcoming);
        assert!(status_for(100, 200, 100) == ChallengeStatus::Live);
        assert!(status_for(100, 200, 200) == ChallengeStatus::Live);
        assert!(status_for(100, 200, 201) == ChallengeStatus::Ended);
    }
}
