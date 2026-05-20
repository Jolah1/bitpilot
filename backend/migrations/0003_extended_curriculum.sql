-- v3: 51-mission curriculum (0..=50, five tiers).
--
-- Schema is unchanged. This migration only fixes participant state to be
-- coherent with the new mission numbering:
--
--  * The new curriculum is 0-indexed (mission 0 = Welcome). The old one was
--    1-indexed (mission 1 = "What is Bitcoin?"). Old rows have
--    current_mission IN (1..=10). We leave those as-is so a participant
--    mid-way through the original 10 missions resumes on a coherent mission
--    in the new curriculum.
--
--  * Old participants who completed all 10 original missions had
--    current_mission stuck at 10. In the new curriculum they'd land on
--    "Custodial vs self-custodial" — not their old "finished" state.
--    Bump them to 11 (start of the Apprentice tier) so they see new
--    content instead of re-doing a familiar one.
--
--  * Participants whose current_mission > 10 don't exist yet (the old
--    curriculum never went that high), so no upper-bound clamp needed.
--
-- This migration is intentionally idempotent: it only touches rows that
-- match the "all-original-10 completed" predicate, and bumping them once
-- past 10 means a re-run finds nothing to update.

UPDATE participants
SET current_mission = 11
WHERE current_mission = 10
  AND (
    SELECT COUNT(*) FROM mission_completions mc
    WHERE mc.participant_id = participants.id
      AND mc.mission BETWEEN 1 AND 10
  ) = 10;
