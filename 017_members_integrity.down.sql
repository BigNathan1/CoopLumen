-- Reverses 017_members_integrity.sql

-- Drop the trigger and column added in the 'up' migration.
DROP TRIGGER IF EXISTS members_updated_at ON members;
ALTER TABLE members DROP COLUMN IF EXISTS updated_at;

-- Drop the constraint and indexes.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_stellar_address_format;
DROP INDEX IF EXISTS idx_members_stellar_address;
DROP INDEX IF EXISTS idx_members_community_active;