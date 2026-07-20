use axum::{
    extract::{Extension, Path, State},
    middleware::from_fn_with_state,
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{
    generate_pairing_code, generate_token, hash_token, normalize_pairing_code,
    require_facilitator, require_participant, AuthedParticipant,
};
use crate::error::AppError;
use crate::models::{
    now, Badge, Guidance, JourneyId, Participant, PracticeMode, Session,
};
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
        .route("/:id/analytics", get(get_session_analytics))
        .layer(from_fn_with_state(state, require_facilitator));
    public.merge(admin)
}

/// `/api/participants` — learner-side. `POST /` is open (joining a session
/// requires only knowing the session id, which the facilitator shares).
/// `GET /me` and `GET /me/completions` require the participant's own bearer token.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new()
        .route("/", post(join_session))
        .route("/pair", post(redeem_pairing_code));
    let authed = Router::new()
        .route("/me", get(get_self))
        .route("/me/profile", patch(update_profile))
        .route("/me/outcome-feedback", patch(update_outcome_feedback))
        .route("/me/blocker", patch(update_blocker))
        .route("/me/completions", get(list_completions))
        .route("/me/badges", get(list_badges))
        .route(
            "/me/badges/:tree/certificate",
            post(crate::routes::certificates::issue_certificate),
        )
        .route("/me/pairing-code", post(create_pairing_code))
        .layer(from_fn_with_state(state, require_participant));
    public.merge(authed)
}

#[derive(Deserialize)]
struct CreateSessionRequest {
    name: String,
    journey_id: Option<JourneyId>,
    guidance: Option<Guidance>,
    session_minutes: Option<u16>,
    practice_mode: Option<PracticeMode>,
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

    let session_minutes = body.session_minutes.unwrap_or(30).clamp(5, 120);
    sqlx::query(
        "INSERT INTO sessions (id, name, facilitator_token_hash, created_at, journey_id, guidance, session_minutes, practice_mode) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&facilitator_hash)
    .bind(created_at)
    .bind(body.journey_id.map(JourneyId::as_str))
    .bind(body.guidance.map(Guidance::as_str))
    .bind(session_minutes as i64)
    .bind(body.practice_mode.map(PracticeMode::as_str))
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
    journey_id: Option<JourneyId>,
    guidance: Option<Guidance>,
    session_minutes: Option<u16>,
    practice_mode: Option<PracticeMode>,
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<SessionResponse>, AppError> {
    let row: (String, String, i64, Option<String>, Option<String>, Option<i64>, Option<String>) =
        sqlx::query_as("SELECT id, name, created_at, journey_id, guidance, session_minutes, practice_mode FROM sessions WHERE id = ?")
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
        journey_id: row.3.as_deref().and_then(JourneyId::parse),
        guidance: row.4.as_deref().map(Guidance::parse),
        session_minutes: row.5.map(|value| value as u16),
        practice_mode: row.6.as_deref().map(PracticeMode::parse),
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

#[derive(Serialize)]
struct SessionAnalytics {
    participants: usize,
    outcome_ready: usize,
    used_outside: usize,
    not_yet_used_outside: usize,
    average_seconds_to_first_action: Option<u64>,
}

async fn get_session_analytics(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<SessionAnalytics>, AppError> {
    let participants = load_participants_by_session(&state, &session_id).await?;
    let mut outcome_ready = 0;
    for participant in &participants {
        if let Some(journey) = participant.journey_id {
            if journey
                .next_incomplete(&participant.completed_missions)
                .is_none()
            {
                outcome_ready += 1;
            }
        }
    }
    let feedback: (i64, i64) = sqlx::query_as(
        "SELECT \
           COALESCE(SUM(CASE WHEN used_outside = 1 THEN 1 ELSE 0 END), 0), \
           COALESCE(SUM(CASE WHEN used_outside = 0 THEN 1 ELSE 0 END), 0) \
         FROM participants WHERE session_id = ?",
    )
    .bind(&session_id)
    .fetch_one(&state.db)
    .await?;
    let first_action: (Option<f64>,) = sqlx::query_as(
        "SELECT AVG(first_completed - created_at) FROM (\
           SELECT p.created_at, MIN(mc.completed_at) AS first_completed \
           FROM participants p JOIN mission_completions mc ON mc.participant_id = p.id \
           WHERE p.session_id = ? GROUP BY p.id\
         )",
    )
    .bind(&session_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(SessionAnalytics {
        participants: participants.len(),
        outcome_ready,
        used_outside: feedback.0 as usize,
        not_yet_used_outside: feedback.1 as usize,
        average_seconds_to_first_action: first_action
            .0
            .and_then(|value| value.is_finite().then_some(value.max(0.0) as u64)),
    }))
}

#[derive(Deserialize)]
struct JoinSessionRequest {
    name: String,
    session_id: String,
    journey_id: Option<JourneyId>,
    guidance: Option<Guidance>,
    session_minutes: Option<u16>,
    practice_mode: Option<PracticeMode>,
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
    let workshop: Option<(Option<String>, Option<String>, Option<i64>, Option<String>)> =
        sqlx::query_as(
            "SELECT journey_id, guidance, session_minutes, practice_mode FROM sessions WHERE id = ?",
        )
        .bind(&body.session_id)
        .fetch_optional(&state.db)
        .await?;
    let workshop = workshop.unwrap_or((None, None, None, None));
    let workshop_journey = workshop.0.as_deref().and_then(JourneyId::parse);
    let journey_id = workshop_journey.or(body.journey_id);
    let guidance = if workshop_journey.is_some() {
        workshop.1.as_deref().map(Guidance::parse)
    } else {
        body.guidance
    }
    .unwrap_or(Guidance::Guided);
    let practice_mode = if workshop_journey.is_some() {
        workshop.3.as_deref().map(PracticeMode::parse)
    } else {
        body.practice_mode
    }
    .unwrap_or(PracticeMode::Simulation);
    let session_minutes = if workshop_journey.is_some() {
        workshop.2.map(|value| value as u16)
    } else {
        body.session_minutes
    }
    .unwrap_or(30)
    .clamp(5, 120);
    sqlx::query(
        "INSERT INTO participants \
         (id, name, session_id, current_mission, nostr_pubkey, auth_token_hash, created_at, last_active, journey_id, guidance, session_minutes, practice_mode) \
         VALUES (?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&body.session_id)
    .bind(&auth_hash)
    .bind(created_at)
    .bind(created_at)
    .bind(journey_id.map(JourneyId::as_str))
    .bind(guidance.as_str())
    .bind(session_minutes as i64)
    .bind(practice_mode.as_str())
    .execute(&state.db)
    .await?;

    Ok(Json(JoinSessionResponse {
        participant: Participant {
            id,
            name: name.to_string(),
            session_id: body.session_id,
            current_mission: 0,
            completed_missions: vec![],
            // New row, no completions → every tree points at its first mission.
            current_per_tree: Participant::hydrate_per_tree("{}", &[]),
            nostr_pubkey: None,
            last_active: created_at as u64,
            streak_count: 0,
            streak_day: 0,
            journey_id,
            guidance,
            session_minutes,
            practice_mode,
            used_outside: None,
            blocker_reason: None,
            blocker_comment: None,
        },
        auth_token,
    }))
}

#[derive(Deserialize)]
struct UpdateProfileRequest {
    journey_id: Option<JourneyId>,
    guidance: Guidance,
    session_minutes: u16,
    practice_mode: PracticeMode,
}

async fn update_profile(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<Json<Participant>, AppError> {
    if !(5..=120).contains(&body.session_minutes) {
        return Err(AppError::BadRequest(
            "session_minutes must be between 5 and 120".into(),
        ));
    }
    sqlx::query(
        "UPDATE participants SET journey_id = ?, guidance = ?, session_minutes = ?, practice_mode = ? WHERE id = ?",
    )
    .bind(body.journey_id.map(JourneyId::as_str))
    .bind(body.guidance.as_str())
    .bind(body.session_minutes as i64)
    .bind(body.practice_mode.as_str())
    .bind(&authed.participant_id)
    .execute(&state.db)
    .await?;
    Ok(Json(load_participant(&state, &authed.participant_id).await?))
}

#[derive(Deserialize)]
struct OutcomeFeedbackRequest {
    used_outside: bool,
}

async fn update_outcome_feedback(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<OutcomeFeedbackRequest>,
) -> Result<Json<Participant>, AppError> {
    sqlx::query(
        "UPDATE participants SET used_outside = ?, feedback_at = ? WHERE id = ?",
    )
    .bind(if body.used_outside { 1 } else { 0 })
    .bind(now() as i64)
    .bind(&authed.participant_id)
    .execute(&state.db)
    .await?;
    Ok(Json(load_participant(&state, &authed.participant_id).await?))
}

#[derive(Deserialize)]
struct UpdateBlockerRequest {
    reason: Option<String>,
    comment: Option<String>,
}

async fn update_blocker(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<UpdateBlockerRequest>,
) -> Result<Json<Participant>, AppError> {
    const REASONS: &[&str] = &[
        "explanation",
        "wallet",
        "network",
        "recipient",
        "payment",
        "other",
    ];
    let reason = body.reason.as_deref().map(str::trim).filter(|value| !value.is_empty());
    if let Some(value) = reason {
        if !REASONS.contains(&value) {
            return Err(AppError::BadRequest("unknown blocker reason".into()));
        }
    }
    let comment = if reason.is_some() {
        body.comment.as_deref().map(str::trim).filter(|value| !value.is_empty())
    } else {
        None
    };
    if comment.is_some_and(|value| value.len() > 240) {
        return Err(AppError::BadRequest("blocker comment too long (max 240 chars)".into()));
    }
    sqlx::query(
        "UPDATE participants SET blocker_reason = ?, blocker_comment = ?, blocker_at = ? WHERE id = ?",
    )
    .bind(reason)
    .bind(comment)
    .bind(reason.map(|_| now() as i64))
    .bind(&authed.participant_id)
    .execute(&state.db)
    .await?;
    Ok(Json(load_participant(&state, &authed.participant_id).await?))
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

/// How long a pairing code stays valid. Short: it exists only to be typed
/// into a second device that is already in hand.
const PAIRING_CODE_TTL_SECS: u64 = 10 * 60;

#[derive(Serialize)]
struct PairingCodeResponse {
    code: String,
    /// Unix seconds after which the code stops working; the UI shows a
    /// countdown from this.
    expires_at: u64,
}

/// `POST /api/participants/me/pairing-code` — device A, authenticated. Issues
/// a fresh single-use code (replacing any previous one) so the learner can
/// continue on another device. Redeeming it there signs this device out.
async fn create_pairing_code(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
) -> Result<Json<PairingCodeResponse>, AppError> {
    let now_secs = now();
    let expires_at = now_secs + PAIRING_CODE_TTL_SECS;
    let code = generate_pairing_code();

    let mut tx = state.db.begin().await?;
    // At most one active code per participant — a new request supersedes the old.
    sqlx::query("DELETE FROM pairing_codes WHERE participant_id = ?")
        .bind(&authed.participant_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO pairing_codes (code, participant_id, expires_at, created_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(&authed.participant_id)
    .bind(expires_at as i64)
    .bind(now_secs as i64)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(PairingCodeResponse { code, expires_at }))
}

#[derive(Deserialize)]
struct RedeemPairingRequest {
    code: String,
}

#[derive(Serialize)]
struct RedeemPairingResponse {
    participant: Participant,
    session_id: String,
    /// A freshly minted token for the redeeming device. The participant's
    /// previous token is now invalid.
    auth_token: String,
}

/// `POST /api/participants/pair` — device B, no auth yet. Redeems a one-time
/// code: rotates the participant's auth token (so device A is signed out) and
/// returns a fresh token plus the participant, so device B resumes the same
/// progress. Rate limiting on the public router guards against code guessing.
async fn redeem_pairing_code(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RedeemPairingRequest>,
) -> Result<Json<RedeemPairingResponse>, AppError> {
    let code = normalize_pairing_code(&body.code);
    if code.is_empty() {
        return Err(AppError::BadRequest("code must not be empty".into()));
    }
    let now_secs = now() as i64;

    let mut tx = state.db.begin().await?;
    // Sweep expired codes so the table can't grow without bound.
    sqlx::query("DELETE FROM pairing_codes WHERE expires_at < ?")
        .bind(now_secs)
        .execute(&mut *tx)
        .await?;

    let row: Option<(String, i64)> =
        sqlx::query_as("SELECT participant_id, expires_at FROM pairing_codes WHERE code = ?")
            .bind(&code)
            .fetch_optional(&mut *tx)
            .await?;
    // One uniform error for unknown and expired, so redeem is not an oracle
    // for which codes exist.
    let (participant_id, _) = row
        .filter(|(_, exp)| *exp >= now_secs)
        .ok_or_else(|| AppError::BadRequest("that code is invalid or has expired".into()))?;

    // Single-use: consume it.
    sqlx::query("DELETE FROM pairing_codes WHERE code = ?")
        .bind(&code)
        .execute(&mut *tx)
        .await?;

    // Rotate the token — device A's bearer stops resolving to this participant.
    let auth_token = generate_token();
    let auth_hash = hash_token(&auth_token);
    sqlx::query("UPDATE participants SET auth_token_hash = ? WHERE id = ?")
        .bind(&auth_hash)
        .bind(&participant_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let participant = load_participant(&state, &participant_id).await?;
    let session_id = participant.session_id.clone();
    Ok(Json(RedeemPairingResponse {
        participant,
        session_id,
        auth_token,
    }))
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

/// `GET /api/participants/me/badges` — one badge per skill tree.
/// Derived from `mission_completions`; no badge table.
/// Always returns exactly 8 entries in tree display order.
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
    let row: Option<(String, String, String, i64, Option<String>, String, i64, i64, i64, Option<String>, String, i64, String, Option<i64>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, nostr_pubkey, current_per_tree, last_active, streak_count, streak_day, journey_id, guidance, session_minutes, practice_mode, used_outside, blocker_reason, blocker_comment \
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

    let completed_missions: Vec<u8> = completed.into_iter().map(|(m,)| m as u8).collect();
    let current_per_tree = Participant::hydrate_per_tree(&row.5, &completed_missions);

    Ok(Participant {
        id: row.0,
        name: row.1,
        session_id: row.2,
        current_mission: row.3 as u8,
        nostr_pubkey: row.4,
        completed_missions,
        current_per_tree,
        last_active: row.6 as u64,
        streak_count: row.7 as u32,
        streak_day: row.8 as u64,
        journey_id: row.9.as_deref().and_then(JourneyId::parse),
        guidance: Guidance::parse(&row.10),
        session_minutes: row.11 as u16,
        practice_mode: PracticeMode::parse(&row.12),
        used_outside: row.13.map(|value| value != 0),
        blocker_reason: row.14,
        blocker_comment: row.15,
    })
}

async fn load_participants_by_session(
    state: &AppState,
    session_id: &str,
) -> Result<Vec<Participant>, AppError> {
    let rows: Vec<(String, String, String, i64, Option<String>, String, i64, i64, i64, Option<String>, String, i64, String, Option<i64>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, name, session_id, current_mission, nostr_pubkey, current_per_tree, last_active, streak_count, streak_day, journey_id, guidance, session_minutes, practice_mode, used_outside, blocker_reason, blocker_comment \
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

        let completed_missions: Vec<u8> = completed.into_iter().map(|(m,)| m as u8).collect();
        let current_per_tree = Participant::hydrate_per_tree(&r.5, &completed_missions);

        out.push(Participant {
            id: r.0,
            name: r.1,
            session_id: r.2,
            current_mission: r.3 as u8,
            nostr_pubkey: r.4,
            completed_missions,
            current_per_tree,
            last_active: r.6 as u64,
            streak_count: r.7 as u32,
            streak_day: r.8 as u64,
            journey_id: r.9.as_deref().and_then(JourneyId::parse),
            guidance: Guidance::parse(&r.10),
            session_minutes: r.11 as u16,
            practice_mode: PracticeMode::parse(&r.12),
            used_outside: r.13.map(|value| value != 0),
            blocker_reason: r.14,
            blocker_comment: r.15,
        });
    }
    Ok(out)
}
