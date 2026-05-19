use crate::error::AppError;

/// Simulated Cashu eCash service.
///
/// Originally backed by the canonical Rust CDK against the public
/// `testnut.cashu.space` mint, but that integration had to be removed when
/// we upgraded sqlx to 0.8.6 to fix 5 RustSec advisories: cdk-sqlite 0.16
/// pins libsqlite3-sys 0.28 (via rusqlite 0.31), and Cargo's `links`
/// constraint disallows linking the same native library at two different
/// versions in a single binary.
///
/// Today this service emits plausible-looking tokens and accepts any
/// cashu-shaped string for redemption. The `simulated` flag is true so the
/// UI renders an honest "Simulated" badge on missions 8 and 9, and the
/// proof-ledger in SQLite still records every mint/redeem so mission
/// completion verification works end-to-end.
///
/// When cdk publishes a release compatible with libsqlite3-sys 0.30, re-add
/// the `cdk` + `cdk-sqlite` deps and restore the real implementation.
pub struct EcashService {
    /// Mint URL the *real* service would point at. Kept here so the
    /// `/api/runtime` endpoint can still expose a meaningful value to the
    /// UI; nothing actually connects to this URL.
    pub mint_url: String,
    /// Always `true` for this stub.
    pub simulated: bool,
}

impl EcashService {
    pub fn new() -> Self {
        let mint_url = std::env::var("CASHU_MINT_URL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "https://testnut.cashu.space".to_string());
        EcashService {
            mint_url,
            simulated: true,
        }
    }

    /// Generate a Cashu-token-shaped string. NOT a real V4 token — won't
    /// import into Minibits/Nutshell/eNuts. Good enough to flow through the
    /// learner UI as if it were real, since mission 9's verifier only
    /// checks that the string was recorded against this participant_id.
    pub async fn mint_token(&self, amount_sats: u64) -> Result<String, AppError> {
        if amount_sats == 0 {
            return Err(AppError::BadRequest("amount_sats must be > 0".into()));
        }
        // Cashu V4 tokens are base64url-encoded CBOR starting with the
        // ASCII prefix "cashuB". We emit "cashuBsim_<ts>_<amount>" — the
        // prefix preserves the visual signal the UI shows to users.
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Ok(format!("cashuBsim_{ts}_{amount_sats}"))
    }

    /// Pretend to redeem. Accepts any non-empty string and reports the
    /// amount as 21 sats — matches the static "21 sats added" copy on
    /// mission 4 of the old UI. When the real service is restored, this
    /// will reflect the mint's authoritative amount.
    pub async fn redeem_token(&self, token: &str) -> Result<u64, AppError> {
        if token.trim().is_empty() {
            return Err(AppError::BadRequest("token must not be empty".into()));
        }
        Ok(21)
    }
}
