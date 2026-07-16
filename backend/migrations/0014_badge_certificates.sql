-- Verifiable badge certificates (issue #59, certification part).
--
-- A certificate is a permanent, public record that a named learner earned
-- one flight-path badge: every mission in the path was completed and
-- server-verified. The proof artifact is a BIP340-signed Nostr event
-- (kind 8, badge award) signed with the server's key, stored verbatim in
-- `event_json` so anyone can verify it offline with standard Nostr tools.
--
-- Deliberately NO foreign key to participants: certificates must outlive
-- any future pruning of learner rows. `participant_id` exists only to make
-- issuance idempotent (one certificate per learner per flight path).
CREATE TABLE badge_certificates (
    id TEXT PRIMARY KEY,               -- uuid v4; unguessable verify handle
    participant_id TEXT NOT NULL,
    tree TEXT NOT NULL,                -- kebab-case Tree slug, e.g. "self-custody"
    participant_name TEXT NOT NULL,    -- display name at issuance time
    missions_completed INTEGER NOT NULL,
    earned_at INTEGER NOT NULL,        -- unix secs the badge unlocked
    issued_at INTEGER NOT NULL,        -- unix secs the certificate was signed
    event_json TEXT NOT NULL,          -- the signed Nostr event, canonical JSON
    UNIQUE (participant_id, tree)
);

-- The server's Nostr signing key for certificates. Generated once on first
-- boot and reused forever so every certificate verifies against the same
-- pubkey. Single-row table (id is CHECKed to 1).
CREATE TABLE cert_signing_key (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    secret_hex TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
