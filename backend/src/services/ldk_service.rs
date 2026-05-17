use crate::error::AppError;

const USE_MOCK: bool = true;

pub struct LightningService;

impl LightningService {
    pub fn new() -> Self { Self }

    pub async fn create_invoice(&self, amount_sats: u64, description: &str) -> Result<String, AppError> {
        if USE_MOCK {
            return Ok(format!("lnbc{}n1pjmockinvoiceqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", amount_sats));
        }
        Err(AppError::Lightning("LDK node not configured".into()))
    }

    pub async fn pay_invoice(&self, invoice: &str) -> Result<String, AppError> {
        if USE_MOCK {
            return Ok(format!("mock_hash_{}", &invoice[..12]));
        }
        Err(AppError::Lightning("LDK node not configured".into()))
    }

    pub async fn is_paid(&self, _payment_hash: &str) -> Result<bool, AppError> {
        if USE_MOCK { return Ok(true); }
        Err(AppError::Lightning("LDK node not configured".into()))
    }
}