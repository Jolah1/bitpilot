use crate::error::AppError;
use nostr_sdk::prelude::*;
use std::time::Duration;

/// Real Nostr service.
///
/// Signs and publishes events on behalf of a participant given their nsec.
/// The nsec is passed in per call — the service never persists it and the
/// HTTP handlers above don't either (see security note in routes/lightning.rs).
///
/// Key generation moved to the browser: the backend never sees an nsec it
/// generated. The browser is the only place a private key originates.
pub struct NostrService {
    relays: Vec<String>,
}

impl NostrService {
    pub fn new() -> Self {
        // Public Nostr relays. Override with `NOSTR_RELAYS` env var (comma-separated).
        let relays = std::env::var("NOSTR_RELAYS")
            .ok()
            .map(|s| {
                s.split(',')
                    .map(|r| r.trim().to_string())
                    .filter(|r| !r.is_empty())
                    .collect::<Vec<_>>()
            })
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                vec![
                    "wss://relay.damus.io".to_string(),
                    "wss://nos.lol".to_string(),
                    "wss://relay.nostr.band".to_string(),
                ]
            });
        NostrService { relays }
    }

    pub fn relays(&self) -> &[String] {
        &self.relays
    }

    /// Publish a kind-1 text note signed with the caller's `nsec`.
    /// Returns the hex event id.
    pub async fn publish_note(&self, nsec: &str, content: &str) -> Result<String, AppError> {
        if content.trim().is_empty() {
            return Err(AppError::BadRequest(
                "note content must not be empty".into(),
            ));
        }
        self.publish_event(nsec, EventBuilder::text_note(content))
            .await
    }

    /// Publish a kind-0 profile metadata event. `about` is optional.
    pub async fn publish_profile(
        &self,
        nsec: &str,
        name: &str,
        about: Option<&str>,
    ) -> Result<String, AppError> {
        // Construct the standard NIP-01 metadata JSON. We use a fresh
        // `Metadata` builder so any future NIP-01 fields (picture, nip05,
        // lud16, …) become a one-liner.
        let mut metadata = Metadata::new().name(name);
        if let Some(a) = about {
            metadata = metadata.about(a);
        }
        self.publish_event(nsec, EventBuilder::metadata(&metadata))
            .await
    }

    /// Publish a kind-3 contact list with exactly one followee. We could
    /// support multiple in future; for the curriculum's "follow one famous
    /// person" mission, one is enough.
    pub async fn publish_follow(&self, nsec: &str, followed_npub: &str) -> Result<String, AppError> {
        // Decode the npub into a `PublicKey` so we can tag it correctly.
        let pk = PublicKey::from_bech32(followed_npub)
            .map_err(|e| AppError::BadRequest(format!("invalid followed npub: {e}")))?;
        let contact = Contact::new(pk);
        self.publish_event(nsec, EventBuilder::contact_list(vec![contact]))
            .await
    }

    /// Internal: sign + broadcast any EventBuilder to all configured relays.
    /// Returns the event_id (hex) on success. Errors if not a single relay
    /// accepts — we'd rather fail loudly than pretend the event landed.
    async fn publish_event(
        &self,
        nsec: &str,
        builder: EventBuilder,
    ) -> Result<String, AppError> {
        let keys =
            Keys::parse(nsec).map_err(|e| AppError::Nostr(format!("invalid nsec: {e}")))?;

        let client = Client::new(keys);
        for relay in &self.relays {
            if let Err(e) = client.add_relay(relay).await {
                tracing::warn!(relay = %relay, error = %e, "could not add relay");
            }
        }
        client.connect().await;

        // Brief settle time so the first publish doesn't race the WS handshake.
        tokio::time::sleep(Duration::from_millis(400)).await;

        let output = client
            .send_event_builder(builder)
            .await
            .map_err(|e| AppError::Nostr(format!("publish failed: {e}")))?;

        let event_id = output.val.to_hex();
        let _ = client.disconnect().await;

        if output.success.is_empty() {
            return Err(AppError::Nostr(format!(
                "no relays accepted the event (tried {})",
                self.relays.len()
            )));
        }

        Ok(event_id)
    }
}
