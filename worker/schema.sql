-- Structural migration only (no versioning column), same spirit as the
-- client's own db.ts normalization: additive, idempotent, safe to re-run.

CREATE TABLE IF NOT EXISTS instructors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  passcode_hash TEXT NOT NULL,
  passcode_salt TEXT NOT NULL,
  profile_photo_key TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES instructors (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_instructor ON sessions (instructor_id);

CREATE TABLE IF NOT EXISTS instructor_data (
  instructor_id TEXT PRIMARY KEY REFERENCES instructors (id),
  blob TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
