use crate::error::AppError;

pub struct NostrService {
    pub use_mock: bool,
}

impl NostrService {
    pub fn new() -> Self {
        NostrService { use_mock: true }
    }

    pub async fn generate_keypair(&self) -> Result<(String, String), AppError> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let hex = format!("{:064x}", ts);
        let npub = format!("npub1{}...{}", &hex[0..8], &hex[56..64]);
        let nsec = format!("nsec1{}...{}", &hex[8..16], &hex[48..56]);
        Ok((npub, nsec))
    }

    pub async fn publish_note(&self, _nsec: &str, content: &str) -> Result<String, AppError> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Take up to 8 *characters* (not bytes) to avoid panicking on multi-byte
        // UTF-8 codepoints like emoji. Byte-slicing a &str at a non-boundary
        // would panic.
        let preview: String = content.chars().take(8).collect();
        Ok(format!("mock_evt_{ts}_{preview}"))
    }
}
