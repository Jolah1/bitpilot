use crate::error::AppError;

pub struct LightningService {
    pub use_mock: bool,
}

impl LightningService {
    pub fn new() -> Self {
        LightningService { use_mock: true }
    }

    pub async fn create_invoice(
        &self,
        amount_sats: u64,
        _description: &str,
    ) -> Result<String, AppError> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(format!("lntbs{}n1mock_{ts}", amount_sats * 1000))
    }

    pub async fn pay_invoice(&self, _bolt11: &str) -> Result<String, AppError> {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(format!("{:064x}", ts))
    }
}
