use crate::error::AppError;
use nostr_sdk::prelude::*;
use std::time::Duration;

/// Real Nostr service.
///
/// - `generate_keypair` produces a real secp256k1 keypair and returns the
///   canonical bech32 `npub` / `nsec` strings.
/// - `publish_note` signs a kind-1 text note with the supplied `nsec` and
///   publishes it to a small pool of well-known public relays.
///
/// No mocks. If relays are unreachable the call fails honestly with
/// `AppError::Nostr`. The caller (an HTTP handler) surfaces that as a 502
/// so the UI can show a real error instead of pretending success.
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

    /// Generate a real Nostr keypair. Returns `(npub, nsec)` as bech32 strings.
    pub async fn generate_keypair(&self) -> Result<(String, String), AppError> {
        let keys = Keys::generate();
        let npub = keys
            .public_key()
            .to_bech32()
            .map_err(|e| AppError::Nostr(format!("encode npub: {e}")))?;
        let nsec = keys
            .secret_key()
            .to_bech32()
            .map_err(|e| AppError::Nostr(format!("encode nsec: {e}")))?;
        Ok((npub, nsec))
    }

    /// Publish a kind-1 text note signed with the caller's `nsec`.
    /// Returns the hex event id.
    pub async fn publish_note(&self, nsec: &str, content: &str) -> Result<String, AppError> {
        if content.trim().is_empty() {
            return Err(AppError::BadRequest("note content must not be empty".into()));
        }

        let keys = Keys::parse(nsec)
            .map_err(|e| AppError::Nostr(format!("invalid nsec: {e}")))?;

        let client = Client::new(keys);
        for relay in &self.relays {
            // Failing to add a single relay is non-fatal — we'll try the rest.
            if let Err(e) = client.add_relay(relay).await {
                tracing::warn!(relay = %relay, error = %e, "could not add relay");
            }
        }
        client.connect().await;

        // Best-effort: wait briefly for relay connections to establish so the
        // first publish doesn't race ahead of the websocket handshake.
        tokio::time::sleep(Duration::from_millis(400)).await;

        let builder = EventBuilder::text_note(content);
        let output = client
            .send_event_builder(builder)
            .await
            .map_err(|e| AppError::Nostr(format!("publish failed: {e}")))?;

        let event_id = output.val.to_hex();

        // Disconnect cleanly so we don't leak websocket tasks.
        let _ = client.disconnect().await;

        if output.success.is_empty() {
            return Err(AppError::Nostr(format!(
                "no relays accepted the note (tried {})",
                self.relays.len()
            )));
        }

        Ok(event_id)
    }
}
