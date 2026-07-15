-- Weekly community challenges (issue #58).
--
-- A challenge is a thin wrapper over a normal session: a themed title, a
-- fixed subset of mission ids, and a start/end window. Participants join
-- the backing session through the ordinary join flow; the public results
-- endpoint ranks them by how many of the challenge's missions they
-- completed inside the window.
CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    title TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    -- JSON array of mission ids, e.g. "[21,22,23,24]".
    missions TEXT NOT NULL,
    -- Unix seconds. Completions count toward the leaderboard only when
    -- starts_at <= completed_at <= ends_at.
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_challenges_window ON challenges (starts_at, ends_at);
