ALTER TABLE sessions ADD COLUMN journey_id TEXT;
ALTER TABLE sessions ADD COLUMN guidance TEXT;
ALTER TABLE sessions ADD COLUMN session_minutes INTEGER;
ALTER TABLE sessions ADD COLUMN practice_mode TEXT;

ALTER TABLE participants ADD COLUMN used_outside INTEGER;
ALTER TABLE participants ADD COLUMN feedback_at INTEGER;
