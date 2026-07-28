-- #027: bootstrap the migration tracking table.
--
-- This file is the single source of truth for `schema_migrations`. The runner
-- (src/db/migrate.ts) executes it before any other migration and records it as
-- applied, so it is never replayed through the normal pending-migration path.
-- Every statement is still written to be safely re-runnable: the file must be
-- a no-op against an already-migrated database.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after the table first shipped. Databases migrated before checksums
-- existed keep NULL here and are skipped by the runner's drift check.
ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT;
-- The runner reads applied migrations with `ORDER BY applied_at ASC, name ASC`.
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON schema_migrations (applied_at);

COMMENT ON TABLE schema_migrations IS
  'One row per applied migration file, written by src/db/migrate.ts.';
COMMENT ON COLUMN schema_migrations.name IS
  'Migration file name, e.g. 002_core_schema.sql. Primary key.';
COMMENT ON COLUMN schema_migrations.applied_at IS
  'Commit time of the transaction that applied the migration.';
