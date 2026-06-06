-- Replace plaintext bearer tokens with SHA-256 hashes.
--
-- Before: `participants.auth_token` and `sessions.facilitator_token` stored
-- the raw 64-hex-char tokens. Anyone with read access to `bitpilot.db` (a
-- copied backup, a leaked volume, ops with shell on the host) could lift
-- every token and impersonate every learner / facilitator.
--
-- After: the table stores only `auth_token_hash` / `facilitator_token_hash`.
-- The plaintext is returned to the user exactly once at issue time
-- (POST /api/sessions, POST /api/participants) and never again exists
-- on the server.
--
-- Migration approach: SQLite has no SHA-256 UDF, so the SQL below cannot
-- compute hashes itself. Instead it stages the old plaintext under a
-- 'legacy:' prefix and a one-shot startup backfill in state::backfill_token_hashes
-- replaces those staged values with real SHA-256 hex. Until that backfill
-- runs (or if it fails), every auth lookup misses — fail-closed, exactly
-- what we want for a half-completed upgrade.
--
-- We rebuild the tables rather than ALTER + DROP because SQLite's DROP
-- COLUMN refuses to remove a column backing a UNIQUE constraint. The
-- foreign-key disable is the standard SQLite table-rebuild pattern; the
-- new tables keep the same FK shape so existing references stay valid.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_participants_auth_token;
DROP INDEX IF EXISTS idx_participants_session;

CREATE TABLE sessions_new (
    id                       TEXT    PRIMARY KEY,
    name                     TEXT    NOT NULL,
    facilitator_token_hash   TEXT    NOT NULL UNIQUE,
    created_at               INTEGER NOT NULL
);

INSERT INTO sessions_new (id, name, facilitator_token_hash, created_at)
    SELECT id, name, 'legacy:' || facilitator_token, created_at FROM sessions;

CREATE TABLE participants_new (
    id                  TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    session_id          TEXT    NOT NULL REFERENCES sessions_new(id) ON DELETE CASCADE,
    current_mission     INTEGER NOT NULL DEFAULT 0,
    sats_earned         INTEGER NOT NULL DEFAULT 0,
    nostr_pubkey        TEXT,
    auth_token_hash     TEXT    NOT NULL UNIQUE,
    created_at          INTEGER NOT NULL
);

INSERT INTO participants_new
    (id, name, session_id, current_mission, sats_earned, nostr_pubkey,
     auth_token_hash, created_at)
    SELECT id, name, session_id, current_mission, sats_earned, nostr_pubkey,
           'legacy:' || auth_token, created_at
        FROM participants;

DROP TABLE participants;
DROP TABLE sessions;

ALTER TABLE sessions_new     RENAME TO sessions;
ALTER TABLE participants_new RENAME TO participants;

CREATE INDEX idx_participants_session   ON participants(session_id);
CREATE INDEX idx_participants_auth_hash ON participants(auth_token_hash);

PRAGMA foreign_keys = ON;
