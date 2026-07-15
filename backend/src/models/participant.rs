use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::models::mission::Tree;

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
}

impl Participant {
    /// Compute the per-tree pointer map.
    ///
    /// `stored_json` is the raw value of the `current_per_tree` column —
    /// `'{}'` for participants who joined before this column was written
    /// to, otherwise a `{"tree-key": next_mission_or_null}` object.
    /// Missing trees are derived from `completed` (first incomplete in
    /// the tree's ordered mission list).
    pub fn hydrate_per_tree(
        stored_json: &str,
        completed: &[u8],
    ) -> BTreeMap<Tree, Option<u8>> {
        let stored: BTreeMap<Tree, Option<u8>> =
            serde_json::from_str(stored_json).unwrap_or_default();
        Tree::ALL
            .iter()
            .map(|&tree| {
                let next = if let Some(&v) = stored.get(&tree) {
                    v
                } else {
                    tree.missions()
                        .iter()
                        .find(|m| !completed.contains(m))
                        .copied()
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
