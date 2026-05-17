use crate::error::AppError;

const USE_MOCK: bool = true;

pub struct NostrService;

impl NostrService {
    pub fn new() -> Self { Self }

    pub async fn generate_keypair(&self) -> Result<(String, String), AppError> {
        if USE_MOCK {
            return Ok((
                "npub1satquestmockpublickeydontusethisqqqqqqqqqqqqqqqqqqqqqqq".into(),
                "nsec1satquestmocksecretkeykeepthissafeqqqqqqqqqqqqqqqqqqqqqq".into(),
            ));
        }
        Err(AppError::Nostr("Nostr not configured".into()))
    }

    pub async fn publish_note(&self, _nsec: &str, content: &str) -> Result<String, AppError> {
        if USE_MOCK {
            let preview = content.chars().take(8).collect::<String>();
            return Ok(format!("mock_event_{preview}"));
        }
        Err(AppError::Nostr("Nostr not configured".into()))
    }
}