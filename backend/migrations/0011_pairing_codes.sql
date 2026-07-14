-- One-time pairing codes for "continue on another device".
--
-- A logged-in learner (device A) asks for a short code; the server stores it
-- here with a short expiry. Device B posts the code to redeem it: the server
-- rotates the participant's auth token (so device A signs out — a deliberate
-- handoff that never leaves a live session on the old device) and hands the
-- new token to device B.
--
-- Codes are single-use and short-lived. At most one active code per
-- participant: requesting a new one replaces any previous. The row is deleted
-- the moment it is redeemed, and expired rows are swept lazily on redeem.

CREATE TABLE pairing_codes (
    code            TEXT    PRIMARY KEY,
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    expires_at      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_pairing_codes_participant ON pairing_codes(participant_id);
