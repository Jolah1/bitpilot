use axum::{
    extract::{Extension, State},
    middleware::from_fn_with_state,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::auth::{require_participant, AuthedParticipant};
use crate::error::AppError;
use crate::models::mission::{DoKind, Tree};
use crate::models::{now, Mission, Participant};
use crate::routes::participants::load_participant;
use crate::state::AppState;

/// `/api/missions/...`
/// - `GET /` is public (static metadata, but with `simulated` overlaid).
/// - `POST /complete` requires the participant's bearer token. The
///   participant_id is taken from the token, NOT from the URL.
pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::new().route("/", get(list_missions));
    let authed = Router::new()
        .route("/complete", post(complete_mission))
        .layer(from_fn_with_state(state, require_participant));
    public.merge(authed)
}

/// Returns all missions with each `simulated` flag overridden to reflect
/// runtime reality. Lightning is simulated iff LNbits creds aren't configured;
/// ecash is simulated iff the Cashu mint couldn't be reached at boot; bitcoin
/// and nostr are always real (knowledge-only or real signed events).
async fn list_missions(State(state): State<Arc<AppState>>) -> Json<Vec<Mission>> {
    let mut missions = Mission::all();
    for m in &mut missions {
        // Only override the simulated flag for missions whose catalogue
        // entry already marked them as "depends on external service".
        // Knowledge missions stay simulated=false regardless.
        if !m.simulated {
            continue;
        }
        m.simulated = match m.tree {
            Tree::Lightning => state.lightning.simulated,
            Tree::Ecash => state.ecash.simulated,
            _ => m.simulated,
        };
    }
    Json(missions)
}

#[derive(Deserialize)]
struct CompleteMissionRequest {
    mission: u8,
    /// Mission-specific proof. Always required (audit #2). The verifier
    /// behind each mission decides what counts.
    proof: String,
}

#[derive(Serialize)]
struct CompleteMissionResponse {
    participant: Participant,
    next_mission: Option<u8>,
}

async fn complete_mission(
    State(state): State<Arc<AppState>>,
    Extension(authed): Extension<AuthedParticipant>,
    Json(body): Json<CompleteMissionRequest>,
) -> Result<Json<CompleteMissionResponse>, AppError> {
    if !(Mission::FIRST..=Mission::LAST).contains(&body.mission) {
        return Err(AppError::BadRequest(format!(
            "mission must be {}..={}, got {}",
            Mission::FIRST,
            Mission::LAST,
            body.mission
        )));
    }
    if body.proof.trim().is_empty() {
        return Err(AppError::BadRequest(
            "proof is required to complete a mission".into(),
        ));
    }

    let p = load_participant(&state, &authed.participant_id).await?;

    if p.completed_missions.contains(&body.mission) {
        return Err(AppError::BadRequest("Mission already completed".into()));
    }

    // Per-tree gate: the requested mission must be the next-incomplete
    // mission within its tree. Trees advance independently — a learner
    // working on Lightning isn't blocked by an unfinished Money lesson.
    let tree = Tree::from_mission(body.mission);
    let pointer = p.current_per_tree.get(&tree).copied().flatten();
    let journey_pointer = p
        .journey_id
        .and_then(|journey| journey.next_incomplete(&p.completed_missions));
    if pointer != Some(body.mission) && journey_pointer != Some(body.mission) {
        return Err(AppError::BadRequest(format!(
            "Not your current mission (tree expected {}; journey expected {}; got {})",
            pointer
                .map(|n| n.to_string())
                .unwrap_or_else(|| "(tree complete)".into()),
            journey_pointer
                .map(|n| n.to_string())
                .unwrap_or_else(|| "(journey complete or not selected)".into()),
            body.mission
        )));
    }

    // ── Verify the proof against the appropriate server-side ledger ─────
    verify_proof(
        &state,
        &authed.participant_id,
        body.mission,
        body.proof.trim(),
    )
    .await?;

    // Compute the new per-tree pointer for this tree: the first mission in
    // the tree's ordered list that isn't completed once we add `body.mission`
    // to the completed set.
    let mut completed_after: Vec<u8> = p.completed_missions.clone();
    completed_after.push(body.mission);
    let next_in_tree = tree
        .missions()
        .iter()
        .find(|m| !completed_after.contains(m))
        .copied();

    // Update the persisted per-tree JSON. We rewrite the whole 9-key
    // object every time so the column is canonical after any write — no
    // partial-state interpretation headaches at read time.
    let mut new_per_tree = p.current_per_tree.clone();
    new_per_tree.insert(tree, next_in_tree);
    let per_tree_json = serde_json::to_string(&new_per_tree)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize per-tree: {e}")))?;

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO mission_completions (participant_id, mission, proof, completed_at) \
         VALUES (?, ?, ?, ?)",
    )
    .bind(&authed.participant_id)
    .bind(body.mission as i64)
    .bind(&body.proof)
    .bind(now() as i64)
    .execute(&mut *tx)
    .await?;

    // Keep the legacy `current_mission` column in sync for any backwards-
    // compat readers. It now tracks the most-recently-advanced tree's
    // pointer; nothing inside this route gates on it anymore.
    let legacy_current = next_in_tree.unwrap_or(body.mission);
    // Streak accounting in the same write: completing on the already-
    // credited day changes nothing, the day after extends the run, any
    // gap starts over at 1.
    let today = (now() / 86_400) as i64;
    sqlx::query(
        "UPDATE participants \
         SET current_mission = ?, current_per_tree = ?, last_active = ?, \
             streak_count = CASE \
                 WHEN streak_day = ? THEN streak_count \
                 WHEN streak_day = ? - 1 THEN streak_count + 1 \
                 ELSE 1 END, \
             streak_day = ? \
         WHERE id = ?",
    )
    .bind(legacy_current as i64)
    .bind(&per_tree_json)
    .bind(now() as i64)
    .bind(today)
    .bind(today)
    .bind(today)
    .bind(&authed.participant_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let updated = load_participant(&state, &authed.participant_id).await?;
    Ok(Json(CompleteMissionResponse {
        participant: updated,
        next_mission: next_in_tree,
    }))
}

/// Minimum character count for a `DoKind::PasteValue` reflection (missions
/// 102/103/104). Not tied to any protocol fact — it's a judgment call about how
/// much text rules out a "no" or a single pasted character while still
/// welcoming a short-but-real answer (a bare docs link, a one-line
/// restatement). Deliberately well under the frontend's per-mission
/// `maxLength` (300 for 102, 500 for 103, 1000 for 104), which caps length
/// rather than setting a floor.
const MIN_PASTE_VALUE_LEN: usize = 20;

/// Verify that a submitted proof matches what the server expects for the
/// given mission. Returns `BadRequest` on mismatch.
///
/// The mapping from mission number → ledger lives in `Mission::do_kind`;
/// here we just translate each kind into the right SQL probe. New mission
/// kinds added to the enum become a compile error here until handled —
/// that's deliberate.
async fn verify_proof(
    state: &AppState,
    participant_id: &str,
    mission: u8,
    proof: &str,
) -> Result<(), AppError> {
    match Mission::do_kind(mission) {
        // Knowledge missions: client must submit *something* (we checked
        // non-empty above); there's no server-side artifact to compare to.
        // The proof string gets recorded in mission_completions for audit.
        DoKind::Knowledge => Ok(()),

        // Missions 102/103/104: a paste-value reflection (a docs link or
        // sentence, a restated "good first issue", or a test or file link).
        // We deliberately do not judge whether the reflection is *good* —
        // we can't, and pretending to would be worse than the honest bar
        // this replaces (issues #81 and #86).
        // All we enforce is that it clears a minimum length, so a
        // one-character answer can't pass it off as substance. The message
        // is written as an invitation to say more, not a rejection.
        DoKind::PasteValue => {
            if proof.chars().count() < MIN_PASTE_VALUE_LEN {
                return Err(AppError::BadRequest(format!(
                    "say a little more: at least {MIN_PASTE_VALUE_LEN} characters, so there's something real to reflect on"
                )));
            }
            Ok(())
        }

        // Mission 14: Nostr identity created in browser; client submits the
        // npub it generated. We don't validate the bech32 here beyond
        // "non-empty"; the very fact that the participant possesses an npub
        // and is willing to publicly tie it to their participant_id is the
        // proof. Stored on the participant row so missions 26/27/30/36 can
        // verify "this is the same identity".
        DoKind::NostrIdentity => {
            // Update the participant row with the submitted npub. This is
            // the only mission that *writes* an identity-binding. We accept
            // any non-empty string that looks like a bech32 npub.
            if !proof.starts_with("npub1") || proof.len() < 32 || proof.len() > 90 {
                return Err(AppError::BadRequest("proof must be a bech32 npub".into()));
            }
            sqlx::query("UPDATE participants SET nostr_pubkey = ? WHERE id = ?")
                .bind(proof)
                .bind(participant_id)
                .execute(&state.db)
                .await?;
            Ok(())
        }

        // Mission 23: lightning receive — proof is a bolt11 we issued.
        DoKind::Invoice => verify_log(state, participant_id, "lightning_log", "invoice", proof).await,

        // Mission 24: lightning send — proof is the recorded payment_hash.
        DoKind::Pay => verify_log(state, participant_id, "lightning_log", "payment", proof).await,

        // Mission 33: ecash claim — proof is the minted token string.
        DoKind::EcashClaim => verify_log(state, participant_id, "ecash_log", "mint", proof).await,

        // Mission 34: ecash spend — proof is the redeemed token string.
        DoKind::EcashSpend => verify_log(state, participant_id, "ecash_log", "redeem", proof).await,

        // Mission 26: nostr publish (kind-1) — proof is the event id.
        DoKind::NostrPublish => verify_nostr_event(state, participant_id, proof).await,

        // Mission 27: nostr profile (kind-0) — same ledger, same shape.
        DoKind::NostrProfile => verify_nostr_event(state, participant_id, proof).await,

        // Mission 30: nostr follow list (kind-3) — same ledger.
        DoKind::NostrFollow => verify_nostr_event(state, participant_id, proof).await,

        // Mission 36: zap receipt — currently simulated; the backend
        // generates a synthetic event_id and records it in nostr_log too,
        // so the same verifier works.
        DoKind::NostrZap => verify_nostr_event(state, participant_id, proof).await,

        // Mission 17: a locally signed event, submitted whole so the
        // learner can see its anatomy. We check the cryptography and that
        // the key is theirs. Nothing is broadcast.
        DoKind::SignEvent => verify_signed_own_event(state, participant_id, proof).await,

        // Mission 42: signet on-chain — proof is a 64-hex txid. We ask
        // Mutinynet, then mempool.space/signet, whether the tx exists.
        DoKind::OnchainSignet => verify_signet_txid(proof).await,

        // Mission 6: the learner reads the current block height off a public
        // explorer. We read it too and allow a few blocks of slack.
        DoKind::ChainTip => verify_chain_tip(proof).await,

        // Mission 51: the learner reports how many transactions the genesis
        // address has. Same idea, wider slack because tributes trickle in.
        DoKind::AddressReuse => verify_address_reuse(proof).await,

        // Mission 105: open-source graduation — proof is the learner's
        // GitHub username plus a PR URL. We ask the GitHub API whether
        // that PR is really merged and really authored by that account.
        DoKind::GithubPr => verify_github_pr(proof).await,

        // Mission 11: seed words generated client-side. We can't verify
        // randomness without seeing it (and we don't want to). Proof is
        // a sha256 of the mnemonic the client generated — a commitment.
        // We accept any 64-character lowercase hex string.
        DoKind::SeedWords => {
            if proof.len() != 64 || !proof.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(AppError::BadRequest(
                    "proof must be a 64-char hex commitment".into(),
                ));
            }
            Ok(())
        }

        // Mission 41: derived address from the BIP39 seed. Client derives
        // m/84'/0'/0'/0/0 and submits the address. We accept any string
        // starting with "bc1" or "tb1" (mainnet/testnet bech32 prefixes) —
        // we don't have a full BIP32 implementation server-side, and the
        // pedagogical goal is "you saw an address come out of a seed",
        // not cryptographic verification.
        DoKind::DeriveAddress => {
            let lower = proof.to_lowercase();
            if !(lower.starts_with("bc1") || lower.starts_with("tb1") || lower.starts_with("bcrt1"))
            {
                return Err(AppError::BadRequest(
                    "proof must be a bech32 segwit address (bc1.../tb1.../bcrt1...)".into(),
                ));
            }
            Ok(())
        }

        // Mission 92: two addresses derived from one seed, the second with
        // a BIP39 passphrase. The passphrase is as sensitive as the seed
        // and stays in the browser; we only ever see the public addresses.
        // The lesson is that they differ, so that is what we check.
        DoKind::PassphraseFork => verify_passphrase_fork(proof),
    }
}

/// Generic ledger probe: "is there a row in `table` for this participant
/// with the given kind and artifact?". Used by every mission whose proof is
/// "the artifact the server just handed you back".
async fn verify_log(
    state: &AppState,
    participant_id: &str,
    table: &str,
    kind: &str,
    artifact: &str,
) -> Result<(), AppError> {
    // table and kind are compile-time constants from this module, never
    // user input — safe to interpolate into the SQL.
    let sql = format!(
        "SELECT artifact FROM {table} \
         WHERE participant_id = ? AND kind = ? AND artifact = ?"
    );
    let row: Option<(String,)> = sqlx::query_as(&sql)
        .bind(participant_id)
        .bind(kind)
        .bind(artifact)
        .fetch_optional(&state.db)
        .await?;
    if row.is_none() {
        return Err(AppError::BadRequest(format!(
            "no {kind} with that artifact recorded for you"
        )));
    }
    Ok(())
}

async fn verify_nostr_event(
    state: &AppState,
    participant_id: &str,
    event_id: &str,
) -> Result<(), AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM nostr_log \
         WHERE participant_id = ? AND event_id = ?",
    )
    .bind(participant_id)
    .bind(event_id)
    .fetch_optional(&state.db)
    .await?;
    if row.is_none() {
        return Err(AppError::BadRequest(
            "no nostr event with that id recorded for you".into(),
        ));
    }
    Ok(())
}

/// Esplora-compatible explorers we accept a signet txid from, in the order
/// we ask them.
///
/// Two networks, because "signet" in practice means two incompatible
/// chains. Mutinynet is a custom signet (30-second blocks) whose faucet is
/// the one that reliably stays up, so we ask it first; default signet is
/// still accepted for learners who used a classic faucet. A txid only ever
/// exists on one of them, so asking both is the difference between the
/// mission working and the mission rejecting a real transaction.
const SIGNET_EXPLORERS: &[(&str, &str)] = &[
    ("Mutinynet", "https://mutinynet.com/api/tx"),
    ("mempool.space", "https://mempool.space/signet/api/tx"),
];

/// Verify a signet transaction id exists by asking a block explorer.
///
/// We don't try to check the amount or destination — the pedagogical goal
/// is "you broadcast a real transaction to a real Bitcoin network and we
/// can independently see it." If any explorer in `SIGNET_EXPLORERS`
/// returns 200 OK for /tx/<txid>, the tx exists.
async fn verify_signet_txid(txid: &str) -> Result<(), AppError> {
    // Be strict about shape: 64 lowercase hex chars. Anything else is
    // either a typo or a probe.
    let txid_clean = txid.trim().to_lowercase();
    if txid_clean.len() != 64 || !txid_clean.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::BadRequest(
            "txid must be 64 hex characters".into(),
        ));
    }

    // 5 sec timeout per explorer — if one is slow we move on rather than
    // hanging the request.
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("bitpilot/0.1")
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(AppError::Internal(anyhow::anyhow!("http client: {e}"))),
    };

    // A 404 from one explorer only means "not on that chain", so it is not
    // an answer on its own. We keep the last non-404 problem to report if
    // every explorer fails to give us a verdict.
    let mut last_problem: Option<String> = None;

    for (name, base) in SIGNET_EXPLORERS {
        let res = match client.get(format!("{base}/{txid_clean}")).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(explorer = name, error = %e, "signet explorer request failed");
                last_problem = Some(format!("could not reach {name}: {e}"));
                continue;
            }
        };
        match res.status().as_u16() {
            200 => return Ok(()),
            404 => continue,
            other => {
                tracing::warn!(explorer = name, status = other, "signet explorer error status");
                last_problem = Some(format!("{name} returned HTTP {other}"));
            }
        }
    }

    // Every explorer we could reach said 404 — that is a real verdict.
    match last_problem {
        None => Err(AppError::BadRequest(
            "transaction not found on Mutinynet or signet — wait for it to propagate, or check the txid"
                .into(),
        )),
        Some(problem) => Err(AppError::Lightning(problem)),
    }
}

/// Mainnet Esplora-compatible explorers, asked in order. Same resilience
/// story as `SIGNET_EXPLORERS`: if the first is down or rate-limiting us,
/// the second answers.
const DEFAULT_MAINNET_EXPLORERS: &[&str] =
    &["https://mempool.space/api", "https://blockstream.info/api"];

/// Explorer bases to ask, honouring `BITPILOT_MAINNET_EXPLORERS` (a
/// comma-separated list of Esplora-compatible API roots).
///
/// Two reasons this is configurable. A self-hoster running their own
/// mempool instance should be able to point BitPilot at it rather than a
/// third party, which is the whole argument of the Full Independence
/// flight path. And the e2e suite points it at a local stub so the
/// browser tests stay hermetic: otherwise seeding a learner past mission 6
/// would need today's real block height, making CI depend on a third
/// party's uptime.
fn mainnet_explorers() -> Vec<String> {
    match std::env::var("BITPILOT_MAINNET_EXPLORERS") {
        Ok(raw) if !raw.trim().is_empty() => raw
            .split(',')
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => DEFAULT_MAINNET_EXPLORERS
            .iter()
            .map(|s| s.to_string())
            .collect(),
    }
}

/// The address that received the very first block reward in 2009. People
/// have sent it tributes ever since, which is exactly why it is the
/// teaching example for address reuse: tens of thousands of payments, all
/// permanently public. We supply it so the learner never has to expose an
/// address of their own.
const GENESIS_ADDRESS: &str = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";

/// Parse a learner-typed count. We accept digit groupings like "63,746"
/// and surrounding whitespace because that is how explorers display them.
fn parse_reported_number(proof: &str) -> Result<u64, AppError> {
    let cleaned: String = proof
        .chars()
        .filter(|c| !c.is_whitespace() && *c != ',')
        .collect();
    if cleaned.is_empty() || !cleaned.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest(
            "enter the number as plain digits".into(),
        ));
    }
    cleaned
        .parse::<u64>()
        .map_err(|_| AppError::BadRequest("that number is out of range".into()))
}

/// Mission 17: the learner signs an event in the browser and submits the
/// whole thing, so the lesson can show them what an event actually is.
///
/// Two checks, and they are the lesson. `verify_signed_event` recomputes
/// the canonical hash and confirms the `id` field really is that hash, then
/// checks the BIP340 signature against the embedded pubkey, so no field can
/// be hand-edited. Then we compare that pubkey to the npub they registered
/// in mission 14, so it has to be their own key and not one copied from a
/// friend or lifted off a relay.
///
/// Deliberately no network: this event is for reading, not publishing.
/// Mission 26 is where broadcasting happens.
async fn verify_signed_own_event(
    state: &AppState,
    participant_id: &str,
    proof: &str,
) -> Result<(), AppError> {
    let json: serde_json::Value = serde_json::from_str(proof)
        .map_err(|e| AppError::BadRequest(format!("proof must be the signed event JSON: {e}")))?;
    let event = crate::services::nostr_service::NostrService::verify_signed_event(json)?;

    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT nostr_pubkey FROM participants WHERE id = ?")
            .bind(participant_id)
            .fetch_optional(&state.db)
            .await?;
    let stored_npub = row.and_then(|(npub,)| npub).ok_or_else(|| {
        AppError::BadRequest("generate your Nostr identity first (mission 14)".into())
    })?;
    let stored_pk = nostr_sdk::PublicKey::parse(&stored_npub)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("stored npub is malformed: {e}")))?;

    if event.pubkey != stored_pk {
        return Err(AppError::BadRequest(
            "that event was signed by a different key than the identity you registered".into(),
        ));
    }
    Ok(())
}

/// True for the bech32 segwit addresses this curriculum derives.
fn looks_like_segwit_address(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.starts_with("bc1") || lower.starts_with("tb1") || lower.starts_with("bcrt1")
}

/// Mission 92: "<address-without-passphrase> <address-with-passphrase>".
///
/// We cannot re-derive these without the seed and passphrase, and we
/// deliberately never receive either. What we can check is the property
/// the mission teaches: one seed plus a passphrase yields a *different*
/// wallet. Two well-formed addresses that differ is exactly that claim.
fn verify_passphrase_fork(proof: &str) -> Result<(), AppError> {
    let parts: Vec<&str> = proof.split_whitespace().collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest(
            "proof must be two addresses: without the passphrase, then with it".into(),
        ));
    }
    if !parts.iter().all(|p| looks_like_segwit_address(p)) {
        return Err(AppError::BadRequest(
            "both proofs must be bech32 segwit addresses (bc1.../tb1.../bcrt1...)".into(),
        ));
    }
    if parts[0].eq_ignore_ascii_case(parts[1]) {
        // Either an empty passphrase or a client that derived once and
        // sent it twice. Both miss the entire point of the mission.
        return Err(AppError::BadRequest(
            "those are the same address, so the passphrase changed nothing. Derive again with a passphrase".into(),
        ));
    }
    Ok(())
}

/// Whether a learner's reported number is close enough to the live one.
///
/// Split out from the verifiers so the tolerance rule is unit-testable
/// without reaching the network, which the fetch half unavoidably needs.
fn is_close_enough(reported: u64, actual: u64, slack: u64) -> bool {
    reported.abs_diff(actual) <= slack
}

/// GET one JSON-ish value from the first mainnet explorer that answers.
/// Returns the raw body so the caller can parse whatever shape it wants.
async fn fetch_from_explorer(path: &str) -> Result<String, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("bitpilot/0.1")
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("http client: {e}")))?;

    let mut last_err = String::from("no explorer answered");
    for base in mainnet_explorers() {
        match client.get(format!("{base}{path}")).send().await {
            Ok(res) if res.status().is_success() => match res.text().await {
                Ok(body) => return Ok(body),
                Err(e) => last_err = format!("could not read response: {e}"),
            },
            Ok(res) => {
                last_err = format!("explorer returned HTTP {}", res.status().as_u16());
                tracing::warn!(explorer = %base, status = res.status().as_u16(), "explorer error");
            }
            Err(e) => {
                last_err = format!("could not reach explorer: {e}");
                tracing::warn!(explorer = %base, error = %e, "explorer request failed");
            }
        }
    }
    // Every explorer failed. This is our problem, not the learner's, so it
    // must not read as "your answer was wrong".
    Err(AppError::Lightning(last_err))
}

/// Mission 6: the learner reports the current block height.
///
/// We fetch the tip ourselves at verify time rather than pinning an
/// expected value, so the answer is different every ten minutes and cannot
/// be copied from a friend or a walkthrough. Blocks can arrive while the
/// learner is typing, and explorers lag each other slightly, so we accept a
/// small window either side.
async fn verify_chain_tip(proof: &str) -> Result<(), AppError> {
    const SLACK: u64 = 3;
    let reported = parse_reported_number(proof)?;
    let body = fetch_from_explorer("/blocks/tip/height").await?;
    let actual: u64 = body
        .trim()
        .parse()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("explorer sent a non-numeric tip")))?;

    if is_close_enough(reported, actual, SLACK) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "that is not the current tip. The chain is at {actual} right now, so check the latest block on the explorer and try again"
        )))
    }
}

/// Mission 51: the learner reports the transaction count of the genesis
/// address.
///
/// Same live-comparison trick as the chain tip. The slack is wider because
/// the address keeps receiving small tributes, and a learner who reads the
/// count and then takes a few minutes over the quiz should not be punished
/// for someone else's transaction landing in between.
async fn verify_address_reuse(proof: &str) -> Result<(), AppError> {
    const SLACK: u64 = 25;
    let reported = parse_reported_number(proof)?;
    let body = fetch_from_explorer(&format!("/address/{GENESIS_ADDRESS}")).await?;
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("explorer sent invalid JSON: {e}")))?;

    // Esplora splits counts into confirmed (chain_stats) and unconfirmed
    // (mempool_stats). Explorers show the sum, so compare against the sum.
    let count = |key: &str| -> u64 {
        parsed
            .get(key)
            .and_then(|v| v.get("tx_count"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    };
    let actual = count("chain_stats") + count("mempool_stats");
    if actual == 0 {
        return Err(AppError::Internal(anyhow::anyhow!(
            "explorer reported no transactions for the genesis address"
        )));
    }

    if is_close_enough(reported, actual, SLACK) {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "that does not match what the chain says. Open the address on the explorer and look for its transaction count".into(),
        ))
    }
}

/// Parsed form of the mission-105 proof: "<github-username> <pr-url>"
/// (either order; we pick the URL out by the github.com marker).
#[derive(Debug, PartialEq)]
struct PrProof {
    owner: String,
    repo: String,
    number: u64,
    username: String,
}

/// Parse the graduation proof without touching the network, so bad input
/// fails fast with a message the learner can act on. Pure function — the
/// GitHub call lives in `verify_github_pr`.
fn parse_pr_proof(proof: &str) -> Result<PrProof, String> {
    let tokens: Vec<&str> = proof.split_whitespace().collect();
    if tokens.len() != 2 {
        return Err(
            "send your GitHub username and the PR URL, separated by a space".into(),
        );
    }
    let (url, username) = if tokens[0].contains("github.com/") {
        (tokens[0], tokens[1])
    } else if tokens[1].contains("github.com/") {
        (tokens[1], tokens[0])
    } else {
        return Err("the PR URL must be a github.com link".into());
    };

    if username.is_empty()
        || username.len() > 39
        || !username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("that does not look like a GitHub username".into());
    }

    // Accept https://github.com/<owner>/<repo>/pull/<n> with optional
    // trailing segments (/files, #discussion_r1, ?diff=split).
    let path = url
        .split("github.com/")
        .nth(1)
        .unwrap_or_default()
        .split(['?', '#'])
        .next()
        .unwrap_or_default();
    let seg: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if seg.len() < 4 || seg[2] != "pull" {
        return Err(
            "the PR URL should look like https://github.com/owner/repo/pull/123".into(),
        );
    }
    let number: u64 = seg[3]
        .parse()
        .map_err(|_| "the PR URL should end in the pull request number".to_string())?;

    Ok(PrProof {
        owner: seg[0].to_string(),
        repo: seg[1].to_string(),
        number,
        username: username.to_string(),
    })
}

/// Verify the mission-105 graduation proof against the GitHub API.
///
/// Two things must hold: the pull request is merged, and its author is the
/// account the learner named. That combination can't be satisfied by
/// pasting someone else's famous PR. Uses the public unauthenticated API
/// (60 req/hour per IP); set GITHUB_TOKEN to raise the limit on busy
/// deployments.
async fn verify_github_pr(proof: &str) -> Result<(), AppError> {
    let pr = parse_pr_proof(proof).map_err(AppError::BadRequest)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}",
        pr.owner, pr.repo, pr.number
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("bitpilot/0.1")
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("http client: {e}")))?;

    let mut req = client
        .get(&url)
        .header("Accept", "application/vnd.github+json");
    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        if !token.is_empty() {
            req = req.bearer_auth(token);
        }
    }

    let res = req.send().await.map_err(|e| {
        tracing::warn!(error = %e, "github api request failed");
        AppError::Lightning(format!("could not reach GitHub: {e}"))
    })?;

    match res.status().as_u16() {
        200 => {}
        404 => {
            return Err(AppError::BadRequest(
                "GitHub can't find that pull request. Check the URL; private repos won't work"
                    .into(),
            ))
        }
        403 | 429 => {
            return Err(AppError::Lightning(
                "GitHub rate limit hit. Wait a few minutes and try again".into(),
            ))
        }
        other => {
            return Err(AppError::Lightning(format!(
                "GitHub returned HTTP {other}"
            )))
        }
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::Lightning(format!("unreadable GitHub response: {e}")))?;

    if body["merged"] != serde_json::Value::Bool(true) {
        return Err(AppError::BadRequest(
            "that pull request isn't merged yet. Come back when a maintainer merges it".into(),
        ));
    }
    let author = body["user"]["login"].as_str().unwrap_or_default();
    if !author.eq_ignore_ascii_case(&pr.username) {
        return Err(AppError::BadRequest(format!(
            "that PR was authored by {author}, not {}. Graduation needs your own merged PR",
            pr.username
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passphrase_fork_requires_two_different_addresses() {
        // The happy path: one seed, two wallets.
        assert!(verify_passphrase_fork("bc1qaaa bc1qbbb").is_ok());
        assert!(verify_passphrase_fork("  tb1qaaa   tb1qbbb  ").is_ok());
    }

    #[test]
    fn passphrase_fork_rejects_a_wallet_that_did_not_fork() {
        // An empty passphrase, or a client deriving once and sending it
        // twice, misses the whole point of the mission.
        assert!(verify_passphrase_fork("bc1qaaa bc1qaaa").is_err());
        assert!(verify_passphrase_fork("bc1qAAA bc1qaaa").is_err());
    }

    #[test]
    fn passphrase_fork_rejects_malformed_proofs() {
        for bad in [
            "",
            "bc1qaaa",                 // only one address
            "bc1qaaa bc1qbbb bc1qccc", // three
            "notanaddress bc1qbbb",    // first not bech32
            "bc1qaaa 1A1zP1eP5QGefi", // second is legacy, not bech32
        ] {
            assert!(
                verify_passphrase_fork(bad).is_err(),
                "should have rejected {bad:?}"
            );
        }
    }

    #[test]
    fn reported_numbers_tolerate_explorer_formatting() {
        // Explorers print grouped digits, and learners copy them verbatim.
        assert_eq!(parse_reported_number("63,746").unwrap(), 63_746);
        assert_eq!(parse_reported_number("  958535 ").unwrap(), 958_535);
        assert_eq!(parse_reported_number("1").unwrap(), 1);
    }

    #[test]
    fn reported_numbers_reject_non_digits() {
        for bad in ["", "  ", "lots", "63.746", "-5", "12a"] {
            assert!(
                parse_reported_number(bad).is_err(),
                "should have rejected {bad:?}"
            );
        }
    }

    #[test]
    fn tolerance_allows_drift_but_not_guessing() {
        // Mission 6: blocks can arrive while the learner types, and
        // explorers lag each other, so a few blocks either way is fine.
        assert!(is_close_enough(958_535, 958_535, 3));
        assert!(is_close_enough(958_532, 958_535, 3));
        assert!(is_close_enough(958_538, 958_535, 3));
        assert!(!is_close_enough(958_531, 958_535, 3));
        // A guess is nowhere near, which is the point: you have to look.
        assert!(!is_close_enough(12_345, 958_535, 3));
        assert!(!is_close_enough(0, 958_535, 3));

        // Mission 51: wider window, tributes trickle into the address.
        assert!(is_close_enough(63_746, 63_760, 25));
        assert!(!is_close_enough(60_000, 63_746, 25));
    }

    #[test]
    fn pr_proof_parses_username_and_url_in_either_order() {
        let want = PrProof {
            owner: "rust-bitcoin".into(),
            repo: "rust-bitcoin".into(),
            number: 42,
            username: "jolah1".into(),
        };
        for p in [
            "jolah1 https://github.com/rust-bitcoin/rust-bitcoin/pull/42",
            "https://github.com/rust-bitcoin/rust-bitcoin/pull/42 jolah1",
            "jolah1 https://github.com/rust-bitcoin/rust-bitcoin/pull/42/files#r1",
        ] {
            assert_eq!(parse_pr_proof(p).unwrap(), want, "proof: {p}");
        }
    }

    #[test]
    fn pr_proof_rejects_malformed_input() {
        for p in [
            "acknowledged",
            "jolah1",
            "jolah1 https://gitlab.com/o/r/pull/1",
            "jolah1 https://github.com/owner/repo/issues/1",
            "jolah1 https://github.com/owner/repo/pull/abc",
            "not a username! https://github.com/o/r/pull/1",
            "jolah1 extra https://github.com/o/r/pull/1",
        ] {
            assert!(parse_pr_proof(p).is_err(), "should reject: {p}");
        }
    }
}
