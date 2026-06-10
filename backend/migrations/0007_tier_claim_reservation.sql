-- Reservation pattern for tier-reward claims.
--
-- Before this migration, the handler called LNbits's `pay_invoice` first
-- and only then wrote the claim row. If the LNbits call succeeded but the
-- DB write failed (disk full, lock contention, OOM), the learner saw a
-- 500 and could retry — possibly with a DIFFERENT invoice — because our
-- DB had no record. LNbits dedupes by payment_hash, not by participant,
-- so a fresh invoice from the same caller would be paid a second time.
--
-- With the `status` column, the handler now:
--   1. Inserts the row with `status = 'pending'` BEFORE calling LNbits.
--   2. Calls pay_invoice.
--   3. UPDATEs to `status = 'paid'` with the real payment_hash on success.
--   4. DELETEs the pending row on failure so the learner can retry.
--
-- A retry that arrives while a pending row exists is only allowed if it
-- carries the SAME invoice (LNbits will dedupe). A retry with a different
-- invoice is rejected with 409 — the only ambiguous case where double-
-- payment could happen.
--
-- Existing rows are 'paid' (the default keeps the migration zero-touch
-- for production data).

ALTER TABLE tier_reward_claims
    ADD COLUMN status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('pending', 'paid'));

CREATE INDEX IF NOT EXISTS idx_tier_reward_claims_status
    ON tier_reward_claims(status);
