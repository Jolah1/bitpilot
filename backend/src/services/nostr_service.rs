use crate::error::AppError;
use nostr_sdk::prelude::*;
use std::time::Duration;

/// Real Nostr service — relay broadcaster only.
///
/// Signing happens entirely in the browser (see frontend `lib/crypto.ts`).
/// The backend's job is to take an already-signed event, verify the
/// signature, and forward it to a fixed set of public relays. The nsec
/// never touches this server.
///
/// Why we still have a server in the loop at all:
///   * Browsers can open WSS to relays directly, but for a curriculum
///     app we want one consistent set of relays + a server-side audit
///     trail (`nostr_log`) so the mission verifier can grade later.
///   * Some classroom networks block outbound WSS to non-standard hosts;
///     proxying through the backend's HTTPS keeps the lesson working.
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

    /// Parse and cryptographically check a signed event, without touching
    /// the network.
    ///
    /// `Event::verify` does two things worth naming, because mission 17 is
    /// built on both: it recomputes the canonical hash and checks the
    /// event's `id` really is that hash, and it checks the BIP340
    /// signature against the embedded pubkey. So a learner cannot hand-edit
    /// any field, and cannot claim someone else's key.
    ///
    /// Offline by design: mission 17 has the learner sign an event to look
    /// inside it, not to publish it, so this must not reach a relay.
    pub fn verify_signed_event(event_json: serde_json::Value) -> Result<Event, AppError> {
        let event: Event = serde_json::from_value(event_json)
            .map_err(|e| AppError::BadRequest(format!("malformed nostr event: {e}")))?;
        event
            .verify()
            .map_err(|e| AppError::BadRequest(format!("invalid nostr event signature: {e}")))?;
        Ok(event)
    }

    /// Broadcast an already-signed event to all configured relays.
    ///
    /// The event must:
    ///   * deserialize into a valid `nostr_sdk::Event`,
    ///   * pass `verify()` (id matches the canonical hash, signature
    ///     verifies against the embedded pubkey).
    ///
    /// Returns the parsed `Event` so the handler can compare its pubkey
    /// against the participant's registered npub (that check is the
    /// handler's responsibility, not this service's).
    pub async fn broadcast_signed_event(
        &self,
        event_json: serde_json::Value,
    ) -> Result<Event, AppError> {
        let event = Self::verify_signed_event(event_json)?;

        // The Client wants *some* signer to construct, but we never call
        // any signing path here — `send_event` takes the event as-is.
        // Throwaway keys are fine.
        let client = Client::new(Keys::generate());
        for relay in &self.relays {
            if let Err(e) = client.add_relay(relay).await {
                tracing::warn!(relay = %relay, error = %e, "could not add relay");
            }
        }
        client.connect().await;

        // Brief settle time so the first publish doesn't race the WS handshake.
        tokio::time::sleep(Duration::from_millis(400)).await;

        let output = client
            .send_event(&event)
            .await
            .map_err(|e| AppError::Nostr(format!("broadcast failed: {e}")))?;
        let _ = client.disconnect().await;

        if output.success.is_empty() {
            return Err(AppError::Nostr(format!(
                "no relays accepted the event (tried {})",
                self.relays.len()
            )));
        }

        Ok(event)
    }
}
