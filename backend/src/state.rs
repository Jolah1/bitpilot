use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};
use std::str::FromStr;
use std::time::Duration;

use crate::services::{EcashService, LightningService, NostrService};

/// Process-wide state shared across handlers.
///
/// Everything that used to live in `Mutex<HashMap<...>>` now lives in SQLite,
/// reached through `db`. The pool itself is `Clone` (cheap — wraps an Arc).
pub struct AppState {
    pub db: SqlitePool,
    pub lightning: LightningService,
    pub nostr: NostrService,
    pub ecash: EcashService,
}

impl AppState {
    pub async fn new() -> anyhow::Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "sqlite://bitpilot.db?mode=rwc".to_string());

        tracing::info!("Opening database: {}", redact_url(&database_url));

        // WAL + NORMAL synchronous is the standard "good defaults" combination
        // for SQLite as an app database: concurrent readers, fewer fsyncs,
        // crash-safe. busy_timeout absorbs transient lock contention.
        let connect_opts = SqliteConnectOptions::from_str(&database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));

        let db = SqlitePoolOptions::new()
            .max_connections(8)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(connect_opts)
            .await?;

        // Apply embedded migrations from `backend/migrations/`. sqlx tracks
        // applied migrations in `_sqlx_migrations`; subsequent boots are
        // no-ops if nothing has changed.
        tracing::info!("Running database migrations…");
        sqlx::migrate!("./migrations").run(&db).await?;

        Ok(Self {
            db,
            lightning: LightningService::new(),
            nostr: NostrService::new(),
            ecash: EcashService::new(),
        })
    }
}

/// Strip query params (which may contain a password) before logging a URL.
fn redact_url(url: &str) -> String {
    match url.find('?') {
        Some(idx) => format!("{}?…", &url[..idx]),
        None => url.to_string(),
    }
}
