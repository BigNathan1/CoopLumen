-- #039: make the members role CHECK constraint replay-safe.
--
-- 011_create_member_roles.sql adds members_role_check with a bare
-- ADD CONSTRAINT. PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS for table
-- constraints, so re-applying that file against a database that already has
-- the constraint fails with duplicate_object.
--
-- 011 is deliberately left untouched. It is already applied on every
-- environment that has run migrations, and the runner's checksum drift
-- detection rejects edits to applied files. Numbering this 019 also keeps the
-- released sequence intact instead of replaying an applied filename.
--
-- DROP then ADD rather than a pg_constraint existence guard: this converges on
-- the correct definition even where the constraint drifted from the four roles
-- below, which a presence-only check would leave in place.
ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members
  ADD CONSTRAINT members_role_check
  CHECK (role IN ('admin', 'treasurer', 'member', 'observer'));
