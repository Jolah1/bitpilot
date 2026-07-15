-- Daily streak: consecutive UTC days with at least one mission completion.
-- `streak_day` is the UTC day number (unix seconds / 86400) most recently
-- credited; `streak_count` is the current run length. Both are updated in
-- the mission-complete transaction: same day = unchanged, previous day =
-- increment, anything else = reset to 1.
ALTER TABLE participants ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 0;
