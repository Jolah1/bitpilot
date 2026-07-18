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
    if pointer != Some(body.mission) {
        return Err(AppError::BadRequest(format!(
            "Not your current mission in this tree (expected {}, got {})",
            pointer
                .map(|n| n.to_string())
                .unwrap_or_else(|| "(tree complete)".into()),
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

        // Mission 42: signet on-chain — proof is a 64-hex txid. We ask
        // mempool.space/signet whether the tx exists.
        DoKind::OnchainSignet => verify_signet_txid(proof).await,

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
