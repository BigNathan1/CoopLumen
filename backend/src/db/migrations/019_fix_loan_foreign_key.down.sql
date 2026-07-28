-- #032: Down migration - restore original foreign key without explicit ON DELETE
--
-- This migration restores the loans.community_id foreign key to its original
-- state (without explicit ON DELETE clause, which defaults to RESTRICT).
-- This is consistent with the original migration 002 behavior.

-- Drop the current foreign key constraint if it exists
ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_community_id_fkey;

-- Recreate the foreign key without explicit ON DELETE (defaults to RESTRICT)
ALTER TABLE loans
  ADD CONSTRAINT loans_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES communities(id);

COMMENT ON CONSTRAINT loans_community_id_fkey ON loans IS
  'Owning community; delete restricted by default to prevent orphaned loans.';