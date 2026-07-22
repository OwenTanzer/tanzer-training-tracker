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

-- Profile metadata lives separately from account creation so tenure can be
-- corrected without rewriting account audit timestamps. The INSERT backfills
-- existing instructors once and is safe to rerun on every deploy.
CREATE TABLE IF NOT EXISTS instructor_profiles (
  instructor_id TEXT PRIMARY KEY REFERENCES instructors (id),
  trainer_since TEXT NOT NULL CHECK (
    length(trainer_since) = 7
    AND substr(trainer_since, 5, 1) = '-'
    AND substr(trainer_since, 6, 2) BETWEEN '01' AND '12'
  )
);

INSERT OR IGNORE INTO instructor_profiles (instructor_id, trainer_since)
SELECT id, substr(created_at, 1, 7) FROM instructors;

-- The authoritative record of a pass-back transfer (#32/#34), written with a
-- single-row INSERT rather than living only inside two opaque blob columns.
-- Before this table existed, the transfer relation was hostage to whole-blob
-- optimistic concurrency on *both* the source and target instructor_data
-- rows, which meant a routine concurrent edit on either side could race the
-- transfer write and require a best-effort compensating rollback. Now only
-- the target blob write (creating the copy Dog) is CAS'd against a routine
-- race; this insert has no conditional/CAS nature of its own (link_id is a
-- fresh UUID every time), so it can only fail on a genuine DB error, not a
-- routine concurrent edit. source_dog_id/target_dog_id aren't foreign keys
-- to anything — dogs live inside the opaque per-instructor blob, not a real
-- table, same as everywhere else in this schema.
CREATE TABLE IF NOT EXISTS dog_transfers (
  link_id TEXT PRIMARY KEY,
  source_instructor_id TEXT NOT NULL REFERENCES instructors (id),
  source_dog_id TEXT NOT NULL,
  target_instructor_id TEXT NOT NULL REFERENCES instructors (id),
  target_dog_id TEXT NOT NULL,
  linked_date TEXT NOT NULL
);

-- Powers the transfer endpoint's idempotency check: "has this exact source
-- dog already been passed to this exact target instructor?"
CREATE INDEX IF NOT EXISTS idx_dog_transfers_source_dog
  ON dog_transfers (source_dog_id, target_instructor_id);
