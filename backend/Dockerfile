# syntax=docker/dockerfile:1.6

# ──────────────────────────────────────────────────────────────────────────
# Stage 1: build
# ──────────────────────────────────────────────────────────────────────────
FROM rust:1.86-bookworm AS builder

# sqlx + libsqlite3-sys need pkg-config and a C toolchain. The Rust image
# ships gcc but pkg-config and the OpenSSL headers (for reqwest's
# native-tls path — we use rustls-tls but keep them in case) are added.
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# ── Cache dependency compilation ─────────────────────────────────────────
# Copy only the manifest files and build a dummy main.rs. Cargo will fetch
# and compile every dependency. As long as Cargo.toml/Cargo.lock don't
# change, this layer is reused and source-code changes get a 30-second
# rebuild instead of 6 minutes.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo 'fn main() { println!("dummy"); }' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src target/release/deps/bitpilot* target/release/bitpilot*

# ── Real build ───────────────────────────────────────────────────────────
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release --locked

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# ──────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# CA certs so reqwest can hit HTTPS upstreams (LNbits, Nostr relays
# negotiated through nostr-sdk's own client). libsqlite3 is needed because
# sqlx links to the system shared lib at runtime. tini gives us a proper
# PID-1 so SIGTERM gets forwarded correctly on Fly stops.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libsqlite3-0 \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Litestream: continuous SQLite backup to an S3-compatible replica. We
# copy the binary out of the official image rather than fetching a tarball
# so the build doesn't depend on an unsigned download. Bump the tag when
# a new litestream release lands.
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream

# Run as non-root.
RUN useradd --system --uid 10001 --shell /usr/sbin/nologin --create-home bitpilot

# Copy the binary, migrations, litestream config, and entrypoint script.
# Entrypoint and config land in well-known paths under /etc and
# /usr/local/bin so they are predictable regardless of WORKDIR.
COPY --from=builder /build/target/release/bitpilot /usr/local/bin/bitpilot
COPY --from=builder /build/migrations /home/bitpilot/migrations
COPY litestream.yml /etc/litestream.yml
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
    && chown -R bitpilot:bitpilot /home/bitpilot

USER bitpilot
WORKDIR /home/bitpilot

# The binary's working directory is /home/bitpilot, so sqlx::migrate!("./migrations")
# resolves correctly. The SQLite database lives on a mounted volume; we
# point DATABASE_URL at /data/bitpilot.db in fly.toml.
EXPOSE 8080

# tini-as-PID-1 so SIGTERM from Fly cleanly stops the server. The
# entrypoint decides between litestream-supervised and direct boot based
# on whether LITESTREAM_REPLICA_URL is set in the environment.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/entrypoint.sh"]
