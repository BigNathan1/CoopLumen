-- #032: Ensure loans.community_id has explicit ON DELETE CASCADE
--
-- Migration 002 created the loans table with a foreign key to communities(id)
-- but omitted the ON DELETE clause, which defaults to RESTRICT. This prevents
-- deleting a community that has associated loans, which is not the intended
-- behavior. Loans should be deleted when their community is deleted.
--
-- This migration re-creates the foreign key with ON DELETE CASCADE.
-- The operation is idempotent: if the constraint already has CASCADE,
-- this does nothing; if the constraint exists without CASCADE, it is updated.
-- This is safe to run multiple times on existing databases.

-- First, check if the constraint exists and what its ON DELETE behavior is
DO $$
DECLARE
  constraint_exists BOOLEAN;
  constraint_name TEXT;
BEGIN
  -- Find the foreign key constraint name
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'loans'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'communities'
    AND ccu.column_name = 'id'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    -- Check current ON DELETE behavior
    SELECT pg_get_constraintdef(pg_constraint.oid) LIKE '%ON DELETE CASCADE%'
      INTO constraint_exists
    FROM pg_constraint
    WHERE conname = constraint_name
      AND contype = 'f';

    IF NOT constraint_exists THEN
      -- Drop the existing constraint and recreate with CASCADE
      EXECUTE format('ALTER TABLE loans DROP CONSTRAINT IF EXISTS %I', constraint_name);
      RAISE NOTICE 'Recreated loans.community_id foreign key with ON DELETE CASCADE';
    ELSE
      RAISE NOTICE 'loans.community_id foreign key already has ON DELETE CASCADE';
    END IF;
  ELSE
    RAISE NOTICE 'No loans.community_id foreign key found, creating new constraint';
  END IF;
END
$$;

-- Create or re-create the foreign key with ON DELETE CASCADE
-- Using IF NOT EXISTS to ensure idempotency
DO $$
BEGIN
  -- Check if the foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'loans'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'communities'
      AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
  ) THEN
    -- Create the constraint if it doesn't exist
    ALTER TABLE loans
      ADD CONSTRAINT loans_community_id_fkey
      FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created loans.community_id foreign key with ON DELETE CASCADE';
  END IF;
END
$$;

COMMENT ON CONSTRAINT loans_community_id_fkey ON loans IS
  'Owning community; cascades on community delete to preserve referential integrity.';