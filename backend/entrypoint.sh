#!/bin/sh
# Container entrypoint. Two run modes, chosen by LITESTREAM_REPLICA_URL:
#
#   set     → restore from S3 (no-op if no replica yet), then
#             `litestream replicate -exec` supervises bitpilot. Litestream
#             tails the WAL, forwards SIGTERM, and flushes on shutdown.
#   unset   → run bitpilot directly. Used for dev/staging with no backup.
#
# Process tree (with litestream):
#   tini → entrypoint.sh → litestream → bitpilot
# Process tree (without):
#   tini → entrypoint.sh → bitpilot

set -e

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
    echo "[entrypoint] litestream replica configured: $LITESTREAM_REPLICA_URL"
    # -if-replica-exists: first-ever boot has no replica yet, and that
    # must not be a fatal error. The migration runner will create the DB
    # from scratch if restore is a no-op.
    litestream restore \
        -if-replica-exists \
        -config /etc/litestream.yml \
        /data/bitpilot.db \
        || echo "[entrypoint] restore skipped (no replica yet or restore failed); continuing"
    exec litestream replicate \
        -config /etc/litestream.yml \
        -exec "/usr/local/bin/bitpilot"
else
    echo "[entrypoint] LITESTREAM_REPLICA_URL unset; running without continuous backup"
    exec /usr/local/bin/bitpilot
fi
