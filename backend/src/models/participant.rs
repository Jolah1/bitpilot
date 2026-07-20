use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::models::mission::Tree;
use crate::models::{Guidance, JourneyId, PracticeMode};

/// Wire-format participant — the shape returned over the API.
///
/// Notable absences from the DB row:
/// - `auth_token` is never serialized; it's returned once from `join_session`
///   as a separate field (see `JoinSessionResponse`) and never re-emitted.
/// - `completed_missions` is reconstructed in the route handler from the
///   `mission_completions` table, not stored as a column.
///
/// `current_per_tree` is hydrated from the `participants.current_per_tree`
/// JSON column when present, otherwise derived from `completed_missions`
/// (first incomplete mission in each tree's ordered list). Always contains
/// all 8 trees on the wire so the frontend can render without branching on
/// "is this tree initialized yet".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub name: String,
    pub session_id: String,
    pub current_mission: u8,
    pub completed_missions: Vec<u8>,
    /// One entry per tree (all 8). `None` means every mission in the tree
    /// is done; `Some(n)` is the next mission to take.
    pub current_per_tree: BTreeMap<Tree, Option<u8>>,
    pub nostr_pubkey: Option<String>,
    /// Unix seconds of the participant's last activity (join, or a mission
    /// completion). The facilitator dashboard uses it to flag learners who
    /// have stalled. Set on join, bumped on every mission completion.
    pub last_active: u64,
    /// Consecutive UTC days with at least one mission completion. 0 until
    /// the first completion; never gates anything, it's a nudge.
    pub streak_count: u32,
    /// UTC day number (unix seconds / 86400) the streak was last credited.
    /// The frontend compares this to its own "today" to show whether the
    /// streak is already banked for the day.
    pub streak_day: u64,
    pub journey_id: Option<JourneyId>,
    pub guidance: Guidance,
    pub session_minutes: u16,
    pub practice_mode: PracticeMode,
    pub used_outside: Option<bool>,
    pub blocker_reason: Option<String>,
    pub blocker_comment: Option<String>,
}

impl Participant {
    /// Compute the per-tree pointer map.
    ///
    /// `stored_json` is the raw value of the `current_per_tree` column —
    /// `'{}'` for participants who joined before this column was written
    /// to, otherwise a `{"tree-key": next_mission_or_null}` object.
    ///
    /// The completion ledger is the authority, not the stored column. The
    /// column is a cache, and it goes stale whenever a tree's mission list
    /// changes: a learner who had finished a tree carries a `null` pointer
    /// ("tree complete") that survives a mission being *added* to that
    /// tree, which locked them out of the new mission permanently and made
    /// the badge they lost impossible to reclaim. So we accept the stored
    /// pointer only when it still agrees with the ledger, and otherwise
    /// re-derive it as the first incomplete mission in tree order.
    pub fn hydrate_per_tree(
        stored_json: &str,
        completed: &[u8],
    ) -> BTreeMap<Tree, Option<u8>> {
        let stored: BTreeMap<Tree, Option<u8>> =
            serde_json::from_str(stored_json).unwrap_or_default();
        Tree::ALL
            .iter()
            .map(|&tree| {
                let derived = tree
                    .missions()
                    .iter()
                    .find(|m| !completed.contains(m))
                    .copied();
                // Trust the cache only where it cannot be wrong: it must
                // name a mission that is in this tree and still outstanding.
                let next = match stored.get(&tree).copied().flatten() {
                    Some(n)
                        if tree.missions().contains(&n) && !completed.contains(&n) =>
                    {
                        Some(n)
                    }
                    _ => derived,
                };
                (tree, next)
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub participant_ids: Vec<String>,
    pub created_at: u64,
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Simulates what happens after a mission is added to a flight path the
    /// learner had already finished: the stored pointer says "tree
    /// complete" (null) from before the addition, but the completion list
    /// no longer covers every mission in the tree.
    ///
    /// The learner must be able to take the new mission. If the pointer
    /// stays None they are locked out of it permanently, and the badge they
    /// lost can never be reclaimed.
    #[test]
    fn stale_complete_pointer_reopens_when_a_mission_is_added() {
        let tree = Tree::Privacy;
        let all = tree.missions();
        // Every mission except the last, standing in for a newly added one.
        let completed: Vec<u8> = all[..all.len() - 1].to_vec();
        let newly_added = *all.last().unwrap();

        // Stored state from when the tree really was complete.
        let stored = r#"{"privacy":null}"#;

        let hydrated = Participant::hydrate_per_tree(stored, &completed);
        assert_eq!(
            hydrated.get(&tree).copied().flatten(),
            Some(newly_added),
            "learner is locked out of mission {newly_added}: the stale 'tree complete' \
             pointer wins over the completion ledger, so the badge can never be reclaimed"
        );
    }
    /// A genuinely finished tree must still report "complete", or every
    /// learner would be sent back to a mission they already did.
    #[test]
    fn a_truly_complete_tree_stays_complete() {
        let tree = Tree::Privacy;
        let completed: Vec<u8> = tree.missions().to_vec();
        let hydrated = Participant::hydrate_per_tree(r#"{"privacy":null}"#, &completed);
        assert_eq!(hydrated.get(&tree).copied().flatten(), None);
    }

    /// A mid-path learner's pointer is left exactly where it was.
    #[test]
    fn an_in_progress_pointer_is_preserved() {
        let tree = Tree::Privacy;
        let all = tree.missions();
        let completed: Vec<u8> = all[..3].to_vec();
        let expected = all[3];
        let stored = format!(r#"{{"privacy":{expected}}}"#);
        let hydrated = Participant::hydrate_per_tree(&stored, &completed);
        assert_eq!(hydrated.get(&tree).copied().flatten(), Some(expected));
    }

    /// A pointer naming an already-completed mission is stale too, and
    /// would otherwise wedge the learner on a mission the gate rejects as
    /// "already completed".
    #[test]
    fn a_pointer_at_an_already_done_mission_is_re_derived() {
        let tree = Tree::Privacy;
        let all = tree.missions();
        let completed: Vec<u8> = all[..3].to_vec();
        let stored = format!(r#"{{"privacy":{}}}"#, all[0]);
        let hydrated = Participant::hydrate_per_tree(&stored, &completed);
        assert_eq!(hydrated.get(&tree).copied().flatten(), Some(all[3]));
    }

    /// Participants predating the column derive everything from the ledger.
    #[test]
    fn an_empty_column_derives_from_the_ledger() {
        let hydrated = Participant::hydrate_per_tree("{}", &[]);
        for &tree in Tree::ALL {
            assert_eq!(
                hydrated.get(&tree).copied().flatten(),
                tree.missions().first().copied(),
                "{tree:?} should start at its first mission"
            );
        }
    }
}
