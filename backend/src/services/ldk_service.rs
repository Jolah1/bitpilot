use crate::error::AppError;
use serde::{Deserialize, Serialize};

/// Lightning service.
///
/// Real mode talks to an LNbits instance over HTTP using a wallet's admin key
/// (typically a signet wallet on `legend.lnbits.com` or your own LNbits
/// install). Set the following env vars to enable real mode:
///   - `LNBITS_URL`        — e.g. `https://legend.lnbits.com`
///   - `LNBITS_ADMIN_KEY`  — the 32-char hex admin key for a single wallet
///
/// If either variable is missing/empty, the service stays in simulated mode
/// (the same plausible-looking strings the old mock returned), and every
/// response is tagged `simulated: true` so the UI is honest about it.
pub struct LightningService {
    pub simulated: bool,
    url: Option<String>,
    admin_key: Option<String>,
    http: reqwest::Client,
}

impl LightningService {
    pub fn new() -> Self {
        let url = std::env::var("LNBITS_URL")
            .ok()
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty());
        let admin_key = std::env::var("LNBITS_ADMIN_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let simulated = url.is_none() || admin_key.is_none();
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .user_agent("bitpilot/0.1")
            .build()
            .expect("reqwest client");

        if simulated {
            tracing::info!("LightningService: simulated mode (set LNBITS_URL + LNBITS_ADMIN_KEY for real testnet)");
        } else {
            tracing::info!(url = %url.as_ref().unwrap(), "LightningService: real mode via LNbits");
        }

        LightningService {
            simulated,
            url,
            admin_key,
            http,
        }
    }

    /// Create an invoice for `amount_sats`. Returns the BOLT11 string.
    pub async fn create_invoice(
        &self,
        amount_sats: u64,
        description: &str,
    ) -> Result<String, AppError> {
        if self.simulated {
            return Ok(simulated_invoice(amount_sats));
        }
        let url = self.url.as_ref().unwrap();
        let key = self.admin_key.as_ref().unwrap();

        #[derive(Serialize)]
        struct Req<'a> {
            out: bool,
            amount: u64,
            memo: &'a str,
        }
        #[derive(Deserialize)]
        struct Res {
            payment_request: String,
            #[allow(dead_code)]
            payment_hash: String,
        }
        let res: Res = self
            .http
            .post(format!("{url}/api/v1/payments"))
            .header("X-Api-Key", key)
            .json(&Req {
                out: false,
                amount: amount_sats,
                memo: description,
            })
            .send()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits request: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Lightning(format!("LNbits status: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits json: {e}")))?;
        Ok(res.payment_request)
    }

    /// Pay a BOLT11 invoice. Returns the payment hash (hex).
    pub async fn pay_invoice(&self, bolt11: &str) -> Result<String, AppError> {
        if self.simulated {
            return Ok(simulated_payment_hash());
        }
        let url = self.url.as_ref().unwrap();
        let key = self.admin_key.as_ref().unwrap();

        #[derive(Serialize)]
        struct Req<'a> {
            out: bool,
            bolt11: &'a str,
        }
        #[derive(Deserialize)]
        struct Res {
            payment_hash: String,
        }
        let res: Res = self
            .http
            .post(format!("{url}/api/v1/payments"))
            .header("X-Api-Key", key)
            .json(&Req { out: true, bolt11 })
            .send()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits request: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Lightning(format!("LNbits status: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits json: {e}")))?;
        Ok(res.payment_hash)
    }
}

fn simulated_invoice(amount_sats: u64) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("lnbcs{}n1simulated{ts}", amount_sats * 1000)
}

fn simulated_payment_hash() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{:064x}", ts)
}
