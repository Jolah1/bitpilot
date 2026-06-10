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
use crate::models::mission::Tier;
use crate::models::{now, Badge, Participant, RewardClaim, Session};
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
        .route("/me/tier-rewards/:tier/claim", post(claim_tier_reward))
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
         (id, name, session_id, current_mission, sats_earned, nostr_pubkey, auth_token_hash, created_at) \
         VALUES (?, ?, ?, 0, 0, NULL, ?, ?)",
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
    let claims = load_tier_claims(&state.db, &authed.participant_id).await?;
    Ok(Json(Badge::all_for(&completions, &claims)))
}

/// Load all tier-reward claim rows for a participant, in the shape
/// `Badge::all_for` expects. Pending reservations (status='pending') are
/// excluded — the UI should treat them as "not yet claimed" because the
/// LNbits payout may still fail.
async fn load_tier_claims(
    db: &sqlx::SqlitePool,
    participant_id: &str,
) -> Result<Vec<(Tier, RewardClaim)>, AppError> {
    let rows: Vec<(String, i64, String, i64, i64)> = sqlx::query_as(
        "SELECT tier, amount_sats, payment_hash, simulated, paid_at \
         FROM tier_reward_claims WHERE participant_id = ? AND status = 'paid'",
    )
    .bind(participant_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|(tier, amount, hash, sim, paid)| {
            tier_from_str(&tier).map(|t| {
                (
                    t,
                    RewardClaim {
                        amount_sats: amount.max(0) as u64,
                        payment_hash: hash,
                        simulated: sim != 0,
                        paid_at: paid,
                    },
                )
            })
        })
        .collect())
}

/// Parse a lowercase tier string as written by `serde(rename_all = "lowercase")`.
/// Unknown values are dropped (badge list just omits the claim) rather than
/// crashing — the CHECK constraint on the table is the real guarantee.
fn tier_from_str(s: &str) -> Option<Tier> {
    match s {
        "novice" => Some(Tier::Novice),
        "apprentice" => Some(Tier::Apprentice),
        "pilot" => Some(Tier::Pilot),
        "navigator" => Some(Tier::Navigator),
        "captain" => Some(Tier::Captain),
        _ => None,
    }
}

fn tier_to_str(t: Tier) -> &'static str {
    match t {
        Tier::Novice => "novice",
        Tier::Apprentice => "apprentice",
        Tier::Pilot => "pilot",
        Tier::Navigator => "navigator",
        Tier::Captain => "captain",
    }
}

#[derive(Deserialize)]
struct ClaimTierRewardRequest {
    /// BOLT11 invoice the learner generated in their wallet for exactly
    /// the tier's reward amount. We don't accept lightning addresses here
    /// (no LNURL client in-tree); learners already know how to make
    /// invoices from mission 23.
    invoice: String,
}

#[derive(Serialize)]
struct ClaimTierRewardResponse {
    tier: Tier,
    amount_sats: u64,
    payment_hash: String,
    /// `true` when LNbits is not configured or LIGHTNING_REAL_ALLOW_PAYOUTS
    /// is unset. UI shows a clear "Simulated" badge in that case.
    simulated: bool,
    paid_at: i64,
}

/// `POST /api/participants/me/tier-rewards/:tier/claim`
///
/// Pays the tier-completion bonus (sats fixed per-tier in `Tier::reward`)
/// to a learner-supplied BOLT11 invoice. One-shot per (participant, tier):
/// the table PK enforces no double-claim.
///
/// Order of checks matters: validate inputs cheaply first, then check
/// claim status (DB lookup), then verify the tier is actually earned
/// (DB lookup + computation). This way bogus tier names and empty
/// invoices fail without hitting the DB for completions.
async fn claim_tier_reward(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Path(tier_str): Path<String>,
    Json(body): Json<ClaimTierRewardRequest>,
) -> Result<Json<ClaimTierRewardResponse>, AppError> {
    let tier = tier_from_str(&tier_str)
        .ok_or_else(|| AppError::BadRequest(format!("unknown tier: {tier_str}")))?;

    let invoice = body.invoice.trim();
    if invoice.is_empty() {
        return Err(AppError::BadRequest("invoice must not be empty".into()));
    }

    // Reservation pattern. Three outcomes for the existence check:
    //   - row with status='paid'    → 409 (one-shot, already claimed)
    //   - row with status='pending' AND invoice matches → resume
    //                                  the in-flight claim (LNbits
    //                                  dedupes by payment_hash so
    //                                  re-calling pay_invoice is safe)
    //   - row with status='pending' AND invoice differs → 409 (we
    //                                  must NOT pay a second invoice
    //                                  while the first is in limbo —
    //                                  that's the double-payment we
    //                                  introduced reservations to stop)
    //   - no row                    → fresh claim, insert pending below
    let existing: Option<(String, String)> = sqlx::query_as(
        "SELECT status, invoice FROM tier_reward_claims \
         WHERE participant_id = ? AND tier = ?",
    )
    .bind(&authed.participant_id)
    .bind(tier_to_str(tier))
    .fetch_optional(&state.db)
    .await?;

    let resuming = match &existing {
        Some((status, _)) if status == "paid" => {
            return Err(AppError::Conflict(format!(
                "{} tier reward already claimed",
                tier_to_str(tier)
            )));
        }
        Some((_, existing_invoice)) if existing_invoice != invoice => {
            return Err(AppError::Conflict(
                "a claim for this tier is in flight with a different \
                 invoice; retry with the original invoice or wait a moment"
                    .into(),
            ));
        }
        Some(_) => true,
        None => false,
    };

    // Earned? Recompute from completions + claims = no drift with the
    // GET /badges view.
    let rows: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT mission, completed_at FROM mission_completions WHERE participant_id = ?",
    )
    .bind(&authed.participant_id)
    .fetch_all(&state.db)
    .await?;
    let completions: Vec<(u8, i64)> = rows.into_iter().map(|(m, t)| (m as u8, t)).collect();
    let badges = Badge::all_for(&completions, &[]);
    let badge = badges
        .iter()
        .find(|b| b.tier == tier)
        .expect("Badge::all_for always returns all 5 tiers");
    if !badge.earned {
        return Err(AppError::Forbidden);
    }

    let amount_sats = tier.reward();
    let payouts_real = state.lightning.payouts_allowed;

    // Real-payout path: decode to verify the invoice is for exactly the
    // tier amount. Stops the learner from sneaking in a 10,000-sat
    // invoice for a 10-sat Novice claim.
    if payouts_real {
        let decoded = state.lightning.decode_invoice(invoice).await.map_err(|e| {
            tracing::warn!(error = %e, "tier reward: decode_invoice failed");
            AppError::BadRequest("invoice could not be decoded".into())
        })?;
        if decoded != amount_sats {
            return Err(AppError::BadRequest(format!(
                "invoice amount must equal {amount_sats} sats, got {decoded}"
            )));
        }
    }

    // Pre-insert the reservation row BEFORE talking to LNbits. If the
    // process dies between this insert and the UPDATE below, the row
    // hangs around as 'pending' and blocks a retry with a different
    // invoice from double-paying. A retry with the same invoice will
    // resume (LNbits dedupes by payment_hash).
    let simulated = !payouts_real;
    if !resuming {
        sqlx::query(
            "INSERT INTO tier_reward_claims \
                (participant_id, tier, amount_sats, invoice, payment_hash, \
                 simulated, paid_at, status) \
             VALUES (?, ?, ?, ?, '', ?, 0, 'pending')",
        )
        .bind(&authed.participant_id)
        .bind(tier_to_str(tier))
        .bind(amount_sats as i64)
        .bind(invoice)
        .bind(if simulated { 1_i64 } else { 0_i64 })
        .execute(&state.db)
        .await?;
    }

    let payment_hash = match state.lightning.pay_invoice(invoice).await {
        Ok(h) => h,
        Err(e) => {
            // Roll back the pending reservation so the learner can retry
            // cleanly. Only clear our own reservation — never touch a
            // row that's already 'paid'.
            let _ = sqlx::query(
                "DELETE FROM tier_reward_claims \
                 WHERE participant_id = ? AND tier = ? AND status = 'pending'",
            )
            .bind(&authed.participant_id)
            .bind(tier_to_str(tier))
            .execute(&state.db)
            .await;
            return Err(e);
        }
    };
    let paid_at = now() as i64;

    // Commit the reservation → paid. If this UPDATE fails the row stays
    // pending; the learner sees a 500 but a retry with the same invoice
    // will hit LNbits's payment dedupe and complete the UPDATE on the
    // second pass. The row PK + invoice equality check above gates this.
    sqlx::query(
        "UPDATE tier_reward_claims \
         SET payment_hash = ?, paid_at = ?, status = 'paid' \
         WHERE participant_id = ? AND tier = ?",
    )
    .bind(&payment_hash)
    .bind(paid_at)
    .bind(&authed.participant_id)
    .bind(tier_to_str(tier))
    .execute(&state.db)
    .await?;

    Ok(Json(ClaimTierRewardResponse {
        tier,
        amount_sats,
        payment_hash,
        simulated,
        paid_at,
    }))
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
