use serde::{Deserialize, Serialize};
use uuid::Uuid;

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

impl Participant {
    pub fn new(name: &str, session_id: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            session_id: session_id.to_string(),
            current_mission: 1,
            completed_missions: vec![],
            sats_earned: 0,
            nostr_pubkey: None,
        }
    }

    pub fn has_completed(&self, mission: u8) -> bool {
        self.completed_missions.contains(&mission)
    }

    pub fn is_current_mission(&self, mission: u8) -> bool {
        self.current_mission == mission
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub participant_ids: Vec<String>,
    pub created_at: u64,
}

impl Session {
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            participant_ids: vec![],
            created_at: now(),
        }
    }
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}