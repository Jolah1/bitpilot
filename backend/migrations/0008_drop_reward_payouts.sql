-- Retire the per-mission and per-tier sats-payout machinery.
--
-- The biz model shifted: badges are the reward, not sats. The two
-- mechanisms this migration removes were already unwired from the UI
-- before this migration; we drop the dead infra so a future contributor
-- can't accidentally surface stale data.
--
-- 1. tier_reward_claims — one-shot per-tier payout (10/21/33/50/100 sats
--    against a learner-supplied invoice). Route already removed in
--    backend/src/routes/participants.rs.
-- 2. participants.sats_earned — running accumulator bumped on each
--    mission completion. Never read by the UI; remained as dead column.

DROP INDEX IF EXISTS idx_tier_reward_claims_status;
DROP INDEX IF EXISTS idx_tier_reward_claims_participant;
DROP TABLE IF EXISTS tier_reward_claims;

ALTER TABLE participants DROP COLUMN sats_earned;
