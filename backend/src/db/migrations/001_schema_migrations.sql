CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after the table first shipped. Databases migrated before checksums
-- existed keep NULL here and are skipped by the runner's drift check.
ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT;
