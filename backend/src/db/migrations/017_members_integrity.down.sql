-- #029: revert the members integrity constraints.
--
-- The members table itself is owned by 002_core_schema.sql and is deliberately
-- left in place — only what 017 added is undone here.

DROP INDEX IF EXISTS idx_members_community_active;
DROP INDEX IF EXISTS idx_members_stellar_address;
CREATE INDEX IF NOT EXISTS idx_members_community ON members (community_id);

DROP TRIGGER IF EXISTS members_updated_at ON members;

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_stellar_address_format;

ALTER TABLE members
  DROP COLUMN IF EXISTS updated_at;
