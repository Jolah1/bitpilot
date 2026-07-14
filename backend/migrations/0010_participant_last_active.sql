-- Server-side activity timestamp, powering the facilitator dashboard's
-- "needs a hand" signal.
--
-- The dashboard flags learners who have stalled on a mission. That was
-- tracked only client-side, so it reset every time the dashboard reloaded.
-- Recording the last activity server-side makes the signal accurate and
-- reload-proof.
--
-- Updated to the current unix time whenever a participant joins or completes
-- a mission. Existing rows backfill to `created_at` (their last known
-- activity) so nobody appears freshly stalled the moment this ships.

ALTER TABLE participants ADD COLUMN last_active INTEGER NOT NULL DEFAULT 0;

UPDATE participants SET last_active = created_at WHERE last_active = 0;
