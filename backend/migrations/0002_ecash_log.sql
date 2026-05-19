-- ecash_log: same pattern as lightning_log/nostr_log. Records every mint/redeem
-- the backend issued, keyed by (kind, artifact), so mission verifiers can
-- check "did this participant actually mint/redeem this token?"

CREATE TABLE IF NOT EXISTS ecash_log (
    kind            TEXT    NOT NULL CHECK (kind IN ('mint', 'redeem')),
    artifact        TEXT    NOT NULL,                                  -- the cashu token string
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    amount_sats     INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (kind, artifact)
);

CREATE INDEX IF NOT EXISTS idx_ecash_log_participant ON ecash_log(participant_id);
