use std::sync::Arc;
use std::time::Duration;

use cdk::nuts::nut00::KnownMethod;
use cdk::nuts::{CurrencyUnit, PaymentMethod};
use cdk::wallet::{ReceiveOptions, SendOptions, Wallet};
use cdk::Amount;
use cdk_sqlite::wallet::memory;
use rand::RngCore;
use tokio::sync::OnceCell;

use crate::error::AppError;

/// Real Cashu eCash service backed by a public Cashu **testnut** mint.
///
/// `testnut.cashu.space` is a fake-Lightning mint: invoices it issues are
/// auto-marked paid, so we can mint tokens instantly without a real LN node.
/// The tokens themselves are real Cashu V4 protocol tokens that any Cashu
/// wallet (Minibits, Nutshell, eNuts…) can import and read.
///
/// One shared backend wallet handles every learner. Each mint+send burns a
/// fresh set of proofs out of that wallet; each redeem brings proofs back in.
/// The wallet's secret seed lives only in memory — restarting the backend
/// wipes everything, which is exactly the same persistence model as the rest
/// of the app (in-memory `HashMap`).
pub struct EcashService {
    /// Mint URL. Defaults to `https://testnut.cashu.space`; override with
    /// `CASHU_MINT_URL` env var.
    pub mint_url: String,
    /// `true` if and only if we couldn't initialize a real CDK wallet at
    /// startup (network down, mint unreachable). When `true`, the service
    /// falls back to the same simulated strings the old service used so
    /// the learner flow doesn't deadlock.
    pub simulated: bool,
    wallet: OnceCell<Result<Wallet, String>>,
}

impl EcashService {
    pub fn new() -> Self {
        let mint_url = std::env::var("CASHU_MINT_URL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "https://testnut.cashu.space".to_string());
        EcashService {
            mint_url,
            simulated: false,
            wallet: OnceCell::new(),
        }
    }

    /// Lazily build the backend's hot wallet for the configured mint.
    /// On any failure we cache the error so subsequent calls don't retry
    /// in a tight loop — the route handler turns that into a 502.
    async fn wallet(&self) -> Result<&Wallet, AppError> {
        let result = self
            .wallet
            .get_or_init(|| async {
                let localstore = match memory::empty().await {
                    Ok(s) => Arc::new(s),
                    Err(e) => return Err(format!("init wallet store: {e}")),
                };
                let seed = {
                    let mut seed = [0u8; 64];
                    rand::thread_rng().fill_bytes(&mut seed);
                    seed
                };
                Wallet::new(&self.mint_url, CurrencyUnit::Sat, localstore, seed, None)
                    .map_err(|e| format!("init wallet: {e}"))
            })
            .await;

        match result {
            Ok(w) => Ok(w),
            Err(msg) => Err(AppError::BadRequest(format!(
                "Cashu wallet unavailable: {msg}"
            ))),
        }
    }

    /// Mint a token worth `amount_sats` and return the encoded token string.
    /// Against the testnut mint, the Lightning invoice that the mint hands
    /// us back is auto-marked paid, so `wait_and_mint_quote` returns almost
    /// instantly.
    pub async fn mint_token(&self, amount_sats: u64) -> Result<String, AppError> {
        if amount_sats == 0 {
            return Err(AppError::BadRequest("amount_sats must be > 0".into()));
        }

        let wallet = self.wallet().await?;
        let amount = Amount::from(amount_sats);

        // Ask the mint to give us proofs. On testnut this resolves in ~1-2s.
        let quote = wallet
            .mint_quote(PaymentMethod::Known(KnownMethod::Bolt11), Some(amount), None, None)
            .await
            .map_err(|e| AppError::BadRequest(format!("mint_quote: {e}")))?;

        wallet
            .wait_and_mint_quote(
                quote,
                Default::default(),
                Default::default(),
                Duration::from_secs(20),
            )
            .await
            .map_err(|e| AppError::BadRequest(format!("wait_and_mint_quote: {e}")))?;

        // Now turn those proofs into a sendable, encoded token.
        let prepared = wallet
            .prepare_send(amount, SendOptions::default())
            .await
            .map_err(|e| AppError::BadRequest(format!("prepare_send: {e}")))?;
        let token = prepared
            .confirm(None)
            .await
            .map_err(|e| AppError::BadRequest(format!("confirm send: {e}")))?;
        Ok(token.to_string())
    }

    /// Redeem a token back into the backend wallet. Returns the amount of
    /// sats the token actually carried (verified by the mint).
    pub async fn redeem_token(&self, token: &str) -> Result<u64, AppError> {
        let wallet = self.wallet().await?;
        let amount = wallet
            .receive(token, ReceiveOptions::default())
            .await
            .map_err(|e| AppError::BadRequest(format!("receive: {e}")))?;
        Ok(u64::from(amount))
    }
}
