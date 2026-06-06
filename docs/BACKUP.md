# Backup & restore

BitPilot's only stateful piece is the SQLite file pointed at by
`DATABASE_URL` (default: `backend/bitpilot.db`). Everything else — Nostr
keys, mission text, env config — is either client-side or in the
deployment manifest.

## What's in the file

| Table                | Holds                                                     | Sensitivity |
|----------------------|-----------------------------------------------------------|-------------|
| `sessions`           | session ids, names, **hashed** facilitator tokens         | low (since 0004) |
| `participants`       | participant ids, names, **hashed** bearer tokens, npubs   | low (since 0004) |
| `mission_completions`| per-participant proof artifacts (npubs, invoices, etc.)   | medium      |
| `lightning_log`      | every invoice + payment hash the server issued            | medium      |
| `nostr_log`          | every Nostr event id the server published                 | low         |
| `ecash_*`            | eCash mint/redeem trail                                   | medium      |

Pre-migration-0004 backups still contain plaintext tokens. Treat them as
secret material and delete them once you no longer need rollback capability.

## Continuous backup (production — preferred)

The production container ships with [Litestream](https://litestream.io)
baked in (see `backend/Dockerfile`, `backend/litestream.yml`,
`backend/entrypoint.sh`). When `LITESTREAM_REPLICA_URL` is set on the
machine, the entrypoint:

1. Restores the SQLite file from the S3 replica on boot (no-op if no
   replica exists yet — first boot creates the DB from migrations).
2. Hands control to `litestream replicate -exec` which supervises the
   backend while streaming the WAL to S3 every 10 s.

This gives point-in-time restore for the last 7 days (retention configured
in `litestream.yml`). To enable on Fly:

```bash
fly secrets set \
    LITESTREAM_REPLICA_URL=s3://your-bucket/bitpilot \
    AWS_ACCESS_KEY_ID=... \
    AWS_SECRET_ACCESS_KEY=... \
    AWS_REGION=eu-west-1
fly deploy
```

For R2/B2/MinIO, extend `backend/litestream.yml` with an `endpoint:` field
under the replica entry rather than overriding via env.

To restore manually to a fresh machine, set the same secrets and deploy —
the entrypoint's restore step will pull the latest snapshot + WAL.

## Online snapshot (one-off, dev)

SQLite has a built-in safe-while-running backup. With the backend live:

```bash
sqlite3 /path/to/bitpilot.db ".backup '/path/to/bitpilot-$(date +%F).db'"
```

This works under WAL (which the backend uses) and produces a consistent
snapshot without taking a lock that blocks readers. Use this for ad-hoc
local backups; in production prefer Litestream above.

## Offline backup

If the backend is stopped, a plain file copy works — but you must also
copy the `-wal` and `-shm` sidecars if they exist:

```bash
systemctl stop bitpilot
cp bitpilot.db bitpilot-$(date +%F).db
cp bitpilot.db-wal bitpilot-$(date +%F).db-wal 2>/dev/null || true
cp bitpilot.db-shm bitpilot-$(date +%F).db-shm 2>/dev/null || true
systemctl start bitpilot
```

The `.backup` command above is simpler and safer; prefer it.

## Restore

```bash
systemctl stop bitpilot
mv bitpilot.db bitpilot.db.broken
cp bitpilot-2026-06-04.db bitpilot.db
systemctl start bitpilot
```

On startup the migration runner is idempotent: it sees the existing
`_sqlx_migrations` table and applies only newer migrations. There is no
"reset" step.

## Where to store backups

The DB no longer holds plaintext tokens (migration 0004 hashed them), but
it does hold a per-participant proof ledger which is mildly sensitive.
Anywhere encrypted at rest is fine: an S3 bucket with SSE, a borgbackup
repo, restic to B2, etc. Don't drop snapshots into a public bucket.

## Rotating after a leak

If you suspect a DB was disclosed before migration 0004 applied — i.e.
plaintext tokens may have leaked — invalidate every issued token:

```sql
DELETE FROM participants;  -- cascades into mission_completions, lightning_log, nostr_log
DELETE FROM sessions;
```

Participants and facilitators will re-join from scratch. Cheap because
sessions are ephemeral workshop-scoped artifacts.
