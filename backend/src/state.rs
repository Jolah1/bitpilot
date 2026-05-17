use std::collections::HashMap;
use std::sync::Mutex;

use crate::models::{Participant, Session};
use crate::services::{LightningService, NostrService};

pub struct AppState {
    pub sessions: Mutex<HashMap<String, Session>>,
    pub participants: Mutex<HashMap<String, Participant>>,
    pub lightning: LightningService,
    pub nostr: NostrService,
}

impl AppState {
    pub async fn new() -> anyhow::Result<Self> {
        Ok(Self {
            sessions: Mutex::new(HashMap::new()),
            participants: Mutex::new(HashMap::new()),
            lightning: LightningService::new(),
            nostr: NostrService::new(),
        })
    }
}