use serde::{Deserialize, Serialize};

/// Wire-format participant — the shape returned over the API.
///
/// Notable absences from the DB row:
/// - `auth_token` is never serialized; it's returned once from `join_session`
///   as a separate field (see `JoinSessionResponse`) and never re-emitted.
/// - `completed_missions` is reconstructed in the route handler from the
///   `mission_completions` table, not stored as a column.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub name: String,
    pub session_id: String,
    pub current_mission: u8,
    pub completed_missions: Vec<u8>,
    pub sats_earned: u64,
    pub nostr_pubkey: Option<String>,
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
