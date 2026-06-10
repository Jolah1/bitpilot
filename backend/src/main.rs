mod auth;
mod error;
mod models;
mod routes;
mod services;
mod state;

use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    routing::get,
    Router,
};
use std::sync::Arc;
use std::time::Duration;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;
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
    //
    // tower_http is left at info by default because TraceLayer's
    // per-request completion event lives under that target — that's the
    // line you'll grep for in prod ("status=… latency=…"). Bumping it to
    // warn silences those.
    //
    // LOG_FORMAT=json emits one JSON object per line. Set this in Fly
    // secrets so log shippers (Logflare, Better Stack, etc.) get
    // structured payloads. Default is the pretty text formatter for dev.
    let env_filter = tracing_subscriber::EnvFilter::new(
        std::env::var("RUST_LOG").unwrap_or_else(|_| "bitpilot=info,tower_http=info".into()),
    );
    let json_logs = std::env::var("LOG_FORMAT")
        .ok()
        .map(|s| s.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if json_logs {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_current_span(true)
                    .with_span_list(false),
            )
            .init();
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(tracing_subscriber::fmt::layer())
            .init();
    }

    tracing::info!("Starting BitPilot backend...");
    let state = Arc::new(AppState::new().await?);

    // Background sweeper that deletes empty `sessions` rows older than the
    // configured grace period. Sized so a facilitator who created a session
    // and never invited anyone doesn't leave that row in the table forever.
    services::prune::spawn_session_pruner(state.db.clone());

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

    // ── Security response headers ────────────────────────────────────────
    // Defense-in-depth: most of these are belt-and-braces for an API that
    // only ever returns JSON. They're still cheap and they make the
    // surface annoying to misuse (no framing, no MIME-sniff, no referer
    // leak). The frontend hosts (Vercel/Cloudflare) inject their own CSP
    // for the HTML/JS bundle; these protect API responses specifically.
    //
    // CSP rationale: an API response should never load anything in a
    // browser. `default-src 'none'` denies absolutely everything; the
    // browser will only honor it if the response gets rendered (e.g. via
    // an `<iframe>` pointing at /api/...), which is exactly the case we
    // want to block.
    //
    // HSTS is gated on `ENABLE_HSTS=1` — only enable behind real TLS, or
    // browsers will refuse to talk to the dev backend on http://localhost.
    let enable_hsts = std::env::var("ENABLE_HSTS")
        .ok()
        .map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    fn static_header(value: &'static str) -> HeaderValue {
        // All values below are compile-time constants we own, so this
        // unwrap can't fail in practice.
        HeaderValue::from_static(value)
    }

    let security_headers = tower::ServiceBuilder::new()
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::CONTENT_SECURITY_POLICY,
            static_header("default-src 'none'; frame-ancestors 'none'"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            static_header("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::X_FRAME_OPTIONS,
            static_header("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::REFERRER_POLICY,
            static_header("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::HeaderName::from_static("permissions-policy"),
            // We use no browser APIs from the backend response — deny all.
            static_header(
                "accelerometer=(), camera=(), geolocation=(), gyroscope=(), \
                 microphone=(), payment=(), usb=()",
            ),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            // Cross-Origin-Opener-Policy isolates this origin from popups
            // it doesn't trust. Same-origin-allow-popups is the most
            // permissive form that still blocks XS-Leaks.
            axum::http::HeaderName::from_static("cross-origin-opener-policy"),
            static_header("same-origin-allow-popups"),
        ));

    // HSTS is its own layer because it has a runtime guard.
    let hsts_layer = if enable_hsts {
        Some(SetResponseHeaderLayer::if_not_present(
            axum::http::header::STRICT_TRANSPORT_SECURITY,
            // 6 months. Don't `preload` — that's a one-way trip.
            static_header("max-age=15552000; includeSubDomains"),
        ))
    } else {
        None
    };
    if !enable_hsts {
        tracing::info!(
            "HSTS disabled (set ENABLE_HSTS=1 once you're behind real TLS to enable)"
        );
    }

    // ── Request id + trace span ──────────────────────────────────────────
    // Every request gets an `x-request-id` (uuid v4) if the caller didn't
    // supply one. The id is woven into the per-request tracing span and
    // echoed back on the response so a 500 in the logs can be matched to
    // a complaint in support. Fly's own `Fly-Request-Id` is left alone;
    // correlate via timestamp + this header.
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|req: &axum::http::Request<_>| {
            let request_id = req
                .headers()
                .get("x-request-id")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("-");
            tracing::info_span!(
                "http",
                request_id = %request_id,
                method = %req.method(),
                path = %req.uri().path(),
            )
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    // ── App router ───────────────────────────────────────────────────────
    // Layer order matters: each `.layer(...)` wraps everything below it, so
    // the *last* one written is the outermost. We want:
    //   CORS (outermost; must see all responses incl. errors from inner layers)
    //   → security headers
    //   → set-request-id  (must run before TraceLayer so the span sees it)
    //   → trace
    //   → propagate-request-id  (copies the id onto the response)
    //   → timeout
    //   → body limit
    //   → rate limit (innermost; runs first, rejects before any work)
    //
    // We deliberately do not stack these inside a single ServiceBuilder
    // because CORS requires `ResBody: Default` which tower_governor's
    // wrapped response body doesn't satisfy. Applying them as separate
    // .layer() calls lets axum box the response between them.
    let mut app = Router::new()
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
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(trace_layer)
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(security_headers)
        .layer(cors);

    if let Some(hsts) = hsts_layer {
        app = app.layer(hsts);
    }

    let app = app.with_state(state);

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

// Fly polls this every 30s. A trivial `SELECT 1` proves the SQLite pool
// is alive end-to-end, so a wedged DB (locked, missing volume mount,
// litestream restore that left a corrupt file) marks the machine
// unhealthy instead of silently serving 500s on real traffic.
async fn health(State(state): State<Arc<AppState>>) -> (StatusCode, &'static str) {
    match sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, "BitPilot is running"),
        Err(e) => {
            tracing::error!("health check db query failed: {e}");
            (StatusCode::SERVICE_UNAVAILABLE, "db unreachable")
        }
    }
}
