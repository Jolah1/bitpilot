ALTER TABLE participants ADD COLUMN journey_id TEXT;
ALTER TABLE participants ADD COLUMN guidance TEXT NOT NULL DEFAULT 'guided';
ALTER TABLE participants ADD COLUMN session_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE participants ADD COLUMN practice_mode TEXT NOT NULL DEFAULT 'simulation';
