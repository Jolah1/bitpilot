-- BitPilot initial schema.
--
-- Design notes:
-- - All ids are TEXT (uuid v4 strings) for portability and to match the
--   existing Rust models without a wire-format change.
-- - Timestamps are stored as INTEGER unix seconds. They're not used for
--   anything user-facing right now, but cheap to add a CHECK or index later.
-- - mission_completions is a separate table (not a JSON column on
--   participants) so we can index by mission and verify proofs without
--   loading the entire participant row.
-- - lightning_log and nostr_log are "proof ledgers" — every time the server
--   issues an invoice or publishes a note, we record it. Mission completion
--   then checks the proof a learner submits against these tables.
--
-- WAL mode and a few pragmas are set at connect time in src/state.rs, not
-- here, because they're connection-level not schema-level.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    -- Per-session facilitator token. Returned exactly once from
    -- POST /api/sessions; the facilitator must keep it and present it in
    -- X-Facilitator-Key for admin views. Separate from any global
    -- FACILITATOR_KEY env var, which is fallback/dev-only.
    facilitator_token   TEXT    NOT NULL UNIQUE,
    created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
    id                  TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    session_id          TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    current_mission     INTEGER NOT NULL DEFAULT 1,
    sats_earned         INTEGER NOT NULL DEFAULT 0,
    nostr_pubkey        TEXT,
    -- Bearer token issued at join. Sent as Authorization: Bearer <token>.
    -- UNIQUE so lookup by token is O(log n) via the index.
    auth_token          TEXT    NOT NULL UNIQUE,
    created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participants_session     ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_auth_token  ON participants(auth_token);

CREATE TABLE IF NOT EXISTS mission_completions (
    participant_id      TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    mission             INTEGER NOT NULL,
    proof               TEXT,                                   -- verifier-specific (event id, payment hash, npub…)
    completed_at        INTEGER NOT NULL,
    PRIMARY KEY (participant_id, mission)
);

-- "Proof ledgers": every artifact the server issues that a learner might
-- later submit as proof of completing a mission lands here. Mission verifiers
-- check submitted proofs against these tables.

CREATE TABLE IF NOT EXISTS lightning_log (
    -- 'invoice' | 'payment' — what kind of artifact this row represents.
    kind            TEXT    NOT NULL CHECK (kind IN ('invoice', 'payment')),
    -- For invoices: the bolt11 string. For payments: the payment hash.
    artifact        TEXT    NOT NULL,
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    amount_sats     INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (kind, artifact)
);

CREATE INDEX IF NOT EXISTS idx_lightning_log_participant ON lightning_log(participant_id);

CREATE TABLE IF NOT EXISTS nostr_log (
    event_id        TEXT    PRIMARY KEY,
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nostr_log_participant ON nostr_log(participant_id);
