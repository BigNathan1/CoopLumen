-- #027: drop the migration tracking table.
--
-- The runner removes a migration's schema_migrations row *before* it executes
-- the down file, so dropping the table here does not strand the bookkeeping.

DROP INDEX IF EXISTS idx_schema_migrations_applied_at;
DROP TABLE IF EXISTS schema_migrations;
