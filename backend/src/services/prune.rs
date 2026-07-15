use sqlx::SqlitePool;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Delete `sessions` rows that have zero participants and were created at
/// least `min_age_secs` ago. Returns the number of rows removed.
///
/// The age guard exists because the join flow is two requests: the
/// facilitator creates the session and *then* tells someone the link.
/// Without a grace period we'd happily evict a session three seconds after
/// it was created, before the first learner has typed their name.
///
/// Idempotent — running it twice in a row removes nothing the second time.
pub async fn prune_empty_sessions(
    db: &SqlitePool,
    min_age_secs: i64,
) -> Result<u64, sqlx::Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let cutoff = now - min_age_secs;

    // Challenge-backed sessions are excluded: a public challenge is often
    // announced days before anyone joins, so "empty and old" is its normal
    // pre-launch state, not abandonment.
    let result = sqlx::query(
        "DELETE FROM sessions \
         WHERE created_at <= ? \
           AND id NOT IN (SELECT DISTINCT session_id FROM participants) \
           AND id NOT IN (SELECT DISTINCT session_id FROM challenges)",
    )
    .bind(cutoff)
    .execute(db)
    .await?;

    Ok(result.rows_affected())
}

/// Spawn the background pruner. Runs once shortly after startup, then on
/// the configured interval forever.
///
/// Why a periodic task instead of on-demand cleanup: empty sessions are
/// almost certainly facilitator typos or abandoned classroom links, and
/// they never get touched again — there's nothing on the hot path that
/// would notice them. A daily sweep keeps the table tidy without adding
/// any cost to normal traffic.
///
/// Config:
///   SESSION_PRUNE_AGE_HOURS       — minimum age before a session is eligible (default 24)
///   SESSION_PRUNE_INTERVAL_HOURS  — how often the sweep runs (default 24)
/// Set either to 0 to disable the pruner entirely (useful in tests / very
/// short-lived dev instances).
pub fn spawn_session_pruner(db: SqlitePool) {
    let age_hours: u64 = std::env::var("SESSION_PRUNE_AGE_HOURS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(24);
    let interval_hours: u64 = std::env::var("SESSION_PRUNE_INTERVAL_HOURS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(24);

    if age_hours == 0 || interval_hours == 0 {
        tracing::info!(
            "session pruner disabled (SESSION_PRUNE_AGE_HOURS or SESSION_PRUNE_INTERVAL_HOURS is 0)"
        );
        return;
    }

    let min_age_secs = (age_hours * 3600) as i64;
    let interval = Duration::from_secs(interval_hours * 3600);
    tracing::info!(
        "session pruner armed: every {}h, deletes empty sessions older than {}h",
        interval_hours,
        age_hours
    );

    tokio::spawn(async move {
        // Brief delay so we don't race the migration/backfill that just ran.
        tokio::time::sleep(Duration::from_secs(60)).await;
        let mut ticker = tokio::time::interval(interval);
        loop {
            ticker.tick().await;
            match prune_empty_sessions(&db, min_age_secs).await {
                Ok(0) => tracing::debug!("session pruner: nothing to remove"),
                Ok(n) => tracing::info!("session pruner: removed {n} empty session(s)"),
                Err(e) => tracing::warn!("session pruner sweep failed: {e}"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn insert_session(db: &SqlitePool, id: &str, created_at: i64) {
        sqlx::query(
            "INSERT INTO sessions (id, name, facilitator_token_hash, created_at) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(id)
        .bind(format!("session-{id}"))
        .bind(format!("hash-{id}"))
        .bind(created_at)
        .execute(db)
        .await
        .unwrap();
    }

    async fn insert_participant(db: &SqlitePool, id: &str, session_id: &str) {
        sqlx::query(
            "INSERT INTO participants \
                 (id, name, session_id, auth_token_hash, created_at) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(format!("learner-{id}"))
        .bind(session_id)
        .bind(format!("auth-{id}"))
        .bind(0_i64)
        .execute(db)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn challenge_backed_sessions_survive_the_prune() {
        let db = fresh_db().await;
        // Both sessions are empty and ancient; only the plain one goes.
        insert_session(&db, "plain-empty", 0).await;
        insert_session(&db, "challenge-backed", 0).await;
        sqlx::query(
            "INSERT INTO challenges \
                 (id, session_id, title, blurb, missions, starts_at, ends_at, created_at) \
             VALUES ('c1', 'challenge-backed', 'Money week', '', '[0,1]', 0, 1, 0)",
        )
        .execute(&db)
        .await
        .unwrap();

        let removed = prune_empty_sessions(&db, 0).await.unwrap();
        assert_eq!(removed, 1);
        let remaining: Vec<(String,)> = sqlx::query_as("SELECT id FROM sessions")
            .fetch_all(&db)
            .await
            .unwrap();
        assert_eq!(remaining, vec![("challenge-backed".to_string(),)]);
    }

    #[tokio::test]
    async fn prunes_old_empty_session_only() {
        let db = fresh_db().await;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Empty and old → should be removed.
        insert_session(&db, "old-empty", now - 48 * 3600).await;
        // Empty but fresh → still in grace period.
        insert_session(&db, "new-empty", now - 60).await;
        // Old but has a participant → keep.
        insert_session(&db, "old-with-learner", now - 48 * 3600).await;
        insert_participant(&db, "p1", "old-with-learner").await;

        let removed = prune_empty_sessions(&db, 24 * 3600).await.unwrap();
        assert_eq!(removed, 1);

        let remaining: Vec<(String,)> =
            sqlx::query_as("SELECT id FROM sessions ORDER BY id")
                .fetch_all(&db)
                .await
                .unwrap();
        let ids: Vec<&str> = remaining.iter().map(|r| r.0.as_str()).collect();
        assert_eq!(ids, vec!["new-empty", "old-with-learner"]);
    }

    #[tokio::test]
    async fn second_run_is_a_no_op() {
        let db = fresh_db().await;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        insert_session(&db, "stale", now - 48 * 3600).await;

        assert_eq!(prune_empty_sessions(&db, 24 * 3600).await.unwrap(), 1);
        assert_eq!(prune_empty_sessions(&db, 24 * 3600).await.unwrap(), 0);
    }
}
