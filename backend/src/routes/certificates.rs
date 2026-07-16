use axum::{
    extract::{Extension, Path, State},
    routing::get,
    Json, Router,
};
use nostr_sdk::prelude::*;
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthedParticipant;
use crate::error::AppError;
use crate::models::{now, Badge, Tree};
use crate::state::AppState;

/// `/api/certificates` — verifiable badge certificates (issue #59).
///
/// A certificate is a permanent public record that a named learner earned
/// one flight-path badge. The proof artifact is a Nostr kind-8 (badge
/// award) event signed with the server's key: anyone can check the BIP340
/// signature offline with standard Nostr tooling, and the verify endpoint
/// re-checks it on every read as well.
///
/// Trust model, stated plainly (and repeated on the verify page): BitPilot
/// verifies *mission completion* server-side; the learner's name is the
/// self-chosen display name, not a checked identity. If the learner made a
/// Nostr identity during the curriculum, the award also p-tags their
/// pubkey, binding the certificate to a key only they control.
pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/:id", get(get_certificate))
}

/// Public wire shape of a certificate. `server_pubkey`/`server_npub` come
/// from the stored event itself (not process state) so certificates signed
/// before a key rotation still present the key that actually signed them.
#[derive(Serialize)]
pub struct CertificateResponse {
    id: String,
    tree: Tree,
    tree_label: &'static str,
    /// Prose rank for sentences, e.g. "Money Pilot".
    rank: &'static str,
    participant_name: String,
    missions_completed: i64,
    earned_at: i64,
    issued_at: i64,
    /// The signed Nostr event, verbatim.
    event: serde_json::Value,
    server_pubkey: String,
    server_npub: String,
    /// Re-verified against the stored event on every read. Defensive: this
    /// can only be false if the database row was tampered with.
    signature_valid: bool,
}

/// `POST /api/participants/me/badges/:tree/certificate` — issue (or
/// return the existing) certificate for one earned badge. Registered in
/// the participants router behind `require_participant`. Idempotent: one
/// certificate per learner per flight path, enforced by a UNIQUE index.
pub async fn issue_certificate(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Path(tree_slug): Path<String>,
) -> Result<Json<CertificateResponse>, AppError> {
    let tree = Tree::from_slug(&tree_slug).ok_or(AppError::NotFound)?;

    if let Some(existing) = load_by_owner(&state, &authed.participant_id, &tree_slug).await? {
        return Ok(Json(existing));
    }

    // Re-derive the badge from completions — never trust the client's
    // claim that it is earned.
    let rows: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT mission, completed_at FROM mission_completions WHERE participant_id = ?",
    )
    .bind(&authed.participant_id)
    .fetch_all(&state.db)
    .await?;
    let completions: Vec<(u8, i64)> = rows.into_iter().map(|(m, t)| (m as u8, t)).collect();
    let badge = Badge::all_for(&completions)
        .into_iter()
        .find(|b| b.tree == tree)
        .ok_or(AppError::NotFound)?;
    if !badge.earned {
        return Err(AppError::BadRequest(
            "Badge not earned yet. Finish every mission in this flight path first.".into(),
        ));
    }
    let earned_at = badge.earned_at.unwrap_or(now() as i64);

    let (name, nostr_pubkey): (String, Option<String>) =
        sqlx::query_as("SELECT name, nostr_pubkey FROM participants WHERE id = ?")
            .bind(&authed.participant_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;

    let cert_id = Uuid::new_v4().to_string();
    let issued_at = now() as i64;
    let event = build_award_event(
        &state.cert_keys,
        &cert_id,
        &tree_slug,
        tree,
        &name,
        badge.required,
        earned_at,
        issued_at,
        nostr_pubkey.as_deref(),
    )?;
    let event_json = serde_json::to_string(&event)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize event: {e}")))?;

    // ON CONFLICT DO NOTHING + re-select covers a concurrent double-issue:
    // whichever insert lands first wins and both callers get that row.
    sqlx::query(
        "INSERT INTO badge_certificates \
         (id, participant_id, tree, participant_name, missions_completed, earned_at, issued_at, event_json) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT (participant_id, tree) DO NOTHING",
    )
    .bind(&cert_id)
    .bind(&authed.participant_id)
    .bind(&tree_slug)
    .bind(&name)
    .bind(badge.required as i64)
    .bind(earned_at)
    .bind(issued_at)
    .bind(&event_json)
    .execute(&state.db)
    .await?;

    load_by_owner(&state, &authed.participant_id, &tree_slug)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("certificate vanished after insert")))
}

/// `GET /api/certificates/:id` — public verify endpoint. No auth: the id
/// is an unguessable UUID and the payload contains only what the learner
/// chose to certify (display name, flight path, dates).
async fn get_certificate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<CertificateResponse>, AppError> {
    let row = sqlx::query_as::<_, CertRow>(
        "SELECT id, tree, participant_name, missions_completed, earned_at, issued_at, event_json \
         FROM badge_certificates WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row.into_response_shape()?))
}

#[derive(sqlx::FromRow)]
struct CertRow {
    id: String,
    tree: String,
    participant_name: String,
    missions_completed: i64,
    earned_at: i64,
    issued_at: i64,
    event_json: String,
}

impl CertRow {
    fn into_response_shape(self) -> Result<CertificateResponse, AppError> {
        let tree = Tree::from_slug(&self.tree)
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("bad tree slug in cert row")))?;
        let event: nostr_sdk::Event = serde_json::from_str(&self.event_json)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("bad event in cert row: {e}")))?;
        let signature_valid = event.verify().is_ok();
        let server_npub = event
            .pubkey
            .to_bech32()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("npub encode: {e}")))?;
        Ok(CertificateResponse {
            id: self.id,
            tree,
            tree_label: tree.label(),
            rank: tree.pilot_title(),
            participant_name: self.participant_name,
            missions_completed: self.missions_completed,
            earned_at: self.earned_at,
            issued_at: self.issued_at,
            event: serde_json::to_value(&event)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("event to value: {e}")))?,
            server_pubkey: event.pubkey.to_hex(),
            server_npub,
            signature_valid,
        })
    }
}

async fn load_by_owner(
    state: &AppState,
    participant_id: &str,
    tree_slug: &str,
) -> Result<Option<CertificateResponse>, AppError> {
    let row = sqlx::query_as::<_, CertRow>(
        "SELECT id, tree, participant_name, missions_completed, earned_at, issued_at, event_json \
         FROM badge_certificates WHERE participant_id = ? AND tree = ?",
    )
    .bind(participant_id)
    .bind(tree_slug)
    .fetch_optional(&state.db)
    .await?;
    row.map(CertRow::into_response_shape).transpose()
}

/// Build and sign the kind-8 badge-award event. The content is a plain
/// human sentence so the certificate reads correctly in any Nostr client;
/// the machine-readable facts ride in tags.
#[allow(clippy::too_many_arguments)]
fn build_award_event(
    keys: &Keys,
    cert_id: &str,
    tree_slug: &str,
    tree: Tree,
    name: &str,
    missions: u8,
    earned_at: i64,
    issued_at: i64,
    nostr_pubkey: Option<&str>,
) -> Result<Event, AppError> {
    let date = chrono::DateTime::from_timestamp(earned_at, 0)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| earned_at.to_string());
    let label = tree.label();
    let rank = tree.pilot_title();
    let content = format!(
        "BitPilot certifies that {name} completed all {missions} missions of the \
         {label} flight path, each verified server-side, and earned the {rank} \
         badge on {date} (UTC)."
    );

    let mut tags = vec![
        Tag::custom(TagKind::custom("badge"), [tree_slug.to_string()]),
        Tag::custom(TagKind::custom("name"), [name.to_string()]),
        Tag::custom(TagKind::custom("earned_at"), [earned_at.to_string()]),
        Tag::custom(TagKind::custom("cert"), [cert_id.to_string()]),
        Tag::custom(TagKind::custom("client"), ["bitpilot".to_string()]),
    ];
    // Bind the award to the learner's own Nostr identity when they made
    // one in the curriculum. Skip silently on anything unparseable — an
    // invalid stored pubkey must not block certification.
    if let Some(pk) = nostr_pubkey.and_then(|s| PublicKey::parse(s).ok()) {
        tags.push(Tag::public_key(pk));
    }

    EventBuilder::new(Kind::BadgeAward, content)
        .tags(tags)
        .custom_created_at(Timestamp::from(issued_at as u64))
        .sign_with_keys(keys)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("sign certificate: {e}")))
}
