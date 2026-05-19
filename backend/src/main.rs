mod auth;
mod error;
mod models;
mod routes;
mod services;
mod state;

use axum::{http::HeaderValue, routing::get, Router};
use std::sync::Arc;
use std::time::Duration;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Load .env (dev-only convenience) ─────────────────────────────────
    // dotenv() returns Err for "file not present" (the common case in prod
    // where env vars come from the orchestrator), so we filter that out.
    // Anything else — malformed file, IO error reading it — gets logged so
    // a typo doesn't silently leave a variable unset.
    match dotenvy::dotenv() {
        Ok(path) => {
            // tracing isn't initialized yet; eprintln is fine for boot logs.
            eprintln!("[boot] loaded .env from {}", path.display());
        }
        Err(e) if e.not_found() => {
            // Expected in production; stay quiet.
        }
        Err(e) => {
            eprintln!("[boot] .env exists but could not be loaded: {e}");
        }
    }

    // ── Tracing ──────────────────────────────────────────────────────────
    // Default in production should be quiet. RUST_LOG overrides freely.
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "bitpilot=info,tower_http=warn".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting BitPilot backend...");
    let state = Arc::new(AppState::new().await?);

    // ── CORS ─────────────────────────────────────────────────────────────
    let allowed_origins: Vec<HeaderValue> = std::env::var("CORS_ALLOWED_ORIGINS")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:5173".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .filter_map(|s| match s.parse::<HeaderValue>() {
            Ok(v) => Some(v),
            Err(e) => {
                tracing::warn!("ignoring invalid CORS origin {:?}: {}", s, e);
                None
            }
        })
        .collect();
    tracing::info!("CORS allowed origins: {:?}", allowed_origins);
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::HeaderName::from_static("x-facilitator-key"),
        ]);

    // ── Body / timeout limits ────────────────────────────────────────────
    let body_limit_bytes: usize = std::env::var("BODY_LIMIT_BYTES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(64 * 1024);

    let request_timeout_secs: u64 = std::env::var("REQUEST_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(25);

    // ── Rate limiting (per-IP token bucket via tower_governor) ───────────
    // Default: refill rate ~1 req/sec sustained (per_second=1), burst=30.
    // The OPTIONS preflight from browsers is unconditional and cheap, so we
    // exclude it from the bucket by not applying the layer to the CORS-only
    // path — easier: keep burst high enough to absorb preflights.
    let rate_per_sec: u64 = std::env::var("RATE_LIMIT_PER_SEC")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1);
    let rate_burst: u32 = std::env::var("RATE_LIMIT_BURST")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(30);

    let governor_conf = std::sync::Arc::new(
        GovernorConfigBuilder::default()
            .per_second(rate_per_sec)
            .burst_size(rate_burst)
            .finish()
            .ok_or_else(|| anyhow::anyhow!("invalid rate-limit configuration"))?,
    );

    // ── App router ───────────────────────────────────────────────────────
    // Layer order matters: each `.layer(...)` wraps everything below it, so
    // the *last* one written is the outermost. We want:
    //   CORS (outermost; must see all responses incl. errors from inner layers)
    //   → trace
    //   → timeout
    //   → body limit
    //   → rate limit (innermost; runs first, rejects before any work)
    //
    // We deliberately do not stack these inside a single ServiceBuilder
    // because CORS requires `ResBody: Default` which tower_governor's
    // wrapped response body doesn't satisfy. Applying them as separate
    // .layer() calls lets axum box the response between them.
    let app = Router::new()
        .route("/api/health", get(health))
        .merge(routes::runtime::router())
        .nest(
            "/api/sessions",
            routes::participants::sessions_router(state.clone()),
        )
        .nest(
            "/api/participants",
            routes::participants::router(state.clone()),
        )
        .nest("/api/missions", routes::missions::router(state.clone()))
        .nest("/api", routes::lightning::router(state.clone()))
        .layer(GovernorLayer {
            config: governor_conf,
        })
        .layer(RequestBodyLimitLayer::new(body_limit_bytes))
        .layer(TimeoutLayer::new(Duration::from_secs(request_timeout_secs)))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        // tower_governor needs the connect info to key its per-IP bucket.
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}

async fn health() -> &'static str {
    "BitPilot is running"
}
