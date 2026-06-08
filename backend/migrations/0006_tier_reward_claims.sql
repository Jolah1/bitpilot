-- One-shot payout when a learner finishes every mission in a tier.
--
-- Per-tier amount is fixed in `models/badge.rs::tier_reward_sats`
-- (mirrored in frontend `lib/types.ts:TIERS[].reward`). One row per
-- (participant, tier); the PK enforces "claim exactly once".
--
-- Real vs simulated:
--   - LNbits + LIGHTNING_REAL_ALLOW_PAYOUTS=1 → real sats moved,
--     `simulated = 0`, `payment_hash` is LNbits's hash.
--   - Otherwise → no sats moved, `simulated = 1`, `payment_hash` is a
--     deterministic placeholder. The row still exists so the UI can show
--     "claimed" and the cap below still applies.
--
-- We deliberately do NOT put tier rewards through lightning_payment_audit
-- — the rewards are naturally bounded (5 tiers × max 100 sats = 500),
-- so the per-participant cap that protects /api/pay would just be
-- duplicate accounting here.

CREATE TABLE IF NOT EXISTS tier_reward_claims (
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    tier            TEXT    NOT NULL CHECK (tier IN ('novice', 'apprentice', 'pilot', 'navigator', 'captain')),
    amount_sats     INTEGER NOT NULL,
    invoice         TEXT    NOT NULL,
    payment_hash    TEXT    NOT NULL,
    simulated       INTEGER NOT NULL DEFAULT 0 CHECK (simulated IN (0, 1)),
    paid_at         INTEGER NOT NULL,
    PRIMARY KEY (participant_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_tier_reward_claims_participant
    ON tier_reward_claims(participant_id);
