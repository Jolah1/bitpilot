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
/// Real *invoices* (receiving) need only LNBITS_URL + LNBITS_ADMIN_KEY.
///
/// Real *payouts* (sending) additionally require `LIGHTNING_REAL_ALLOW_PAYOUTS=1`.
/// This double-opt-in is intentional: it ensures a misconfigured staging
/// box can't accidentally drain the wallet just because the LNbits
/// credentials happen to be present in its env. To move real sats out you
/// must set THREE variables, not two.
///
/// If LNBITS_URL or LNBITS_ADMIN_KEY is missing, `simulated` is true and
/// both invoice creation and payment return plausible-looking strings.
/// If payouts are not allowed but invoices are, `pay_invoice` falls back
/// to simulated even though invoices remain real.
pub struct LightningService {
    /// True when LNbits is not configured. Reported to the UI via
    /// `/api/runtime` so the frontend can render a "Simulated" badge.
    pub simulated: bool,
    /// True only when LNbits is configured AND
    /// `LIGHTNING_REAL_ALLOW_PAYOUTS=1`. Controls whether `/api/pay`
    /// actually moves sats. Read this — not `simulated` — when deciding
    /// whether a payment is real.
    pub payouts_allowed: bool,
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
        let opt_in = std::env::var("LIGHTNING_REAL_ALLOW_PAYOUTS")
            .ok()
            .map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let payouts_allowed = !simulated && opt_in;

        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .user_agent("bitpilot/0.1")
            .build()
            .expect("reqwest client");

        if simulated {
            tracing::info!("LightningService: simulated mode (set LNBITS_URL + LNBITS_ADMIN_KEY for real testnet)");
        } else if payouts_allowed {
            tracing::warn!(
                url = %url.as_ref().unwrap(),
                "LightningService: REAL payouts enabled (LIGHTNING_REAL_ALLOW_PAYOUTS=1). \
                 /api/pay will move real sats subject to MAX_PAYMENT_SATS \
                 and MAX_PARTICIPANT_PAYOUT_SATS caps."
            );
        } else {
            tracing::info!(
                url = %url.as_ref().unwrap(),
                "LightningService: real invoices, simulated payouts. \
                 Set LIGHTNING_REAL_ALLOW_PAYOUTS=1 to enable real /api/pay."
            );
        }

        LightningService {
            simulated,
            payouts_allowed,
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

    /// Decode a BOLT11 invoice via LNbits and return its amount in sats.
    /// Source of truth for the amount, NOT the caller — the wire payload
    /// could lie. Returns an error in simulated mode (caller must guard).
    pub async fn decode_invoice(&self, bolt11: &str) -> Result<u64, AppError> {
        if self.simulated {
            return Err(AppError::Lightning(
                "cannot decode invoice in simulated mode".into(),
            ));
        }
        let url = self.url.as_ref().unwrap();
        let key = self.admin_key.as_ref().unwrap();

        #[derive(Serialize)]
        struct Req<'a> {
            data: &'a str,
        }
        // LNbits returns amount in millisats. We round down to sats (any
        // sub-sat residue can't be paid on Lightning anyway).
        #[derive(Deserialize)]
        struct Res {
            amount_msat: u64,
        }
        let res: Res = self
            .http
            .post(format!("{url}/api/v1/payments/decode"))
            .header("X-Api-Key", key)
            .json(&Req { data: bolt11 })
            .send()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits decode request: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Lightning(format!("LNbits decode status: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Lightning(format!("LNbits decode json: {e}")))?;
        Ok(res.amount_msat / 1000)
    }

    /// Pay a BOLT11 invoice. Returns the payment hash (hex).
    ///
    /// Falls back to simulated mode if `payouts_allowed` is false (i.e.
    /// LNbits is configured but `LIGHTNING_REAL_ALLOW_PAYOUTS=1` is not).
    /// Callers should enforce per-call and per-participant caps BEFORE
    /// calling this — see routes/lightning.rs:pay_invoice.
    pub async fn pay_invoice(&self, bolt11: &str) -> Result<String, AppError> {
        if !self.payouts_allowed {
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
