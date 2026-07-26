-- #029: members table — community FK and integrity constraints.
--
-- Numbered 017 rather than 003: slot 003 is already taken by
-- 003_updated_at_trigger.sql, and migrations are applied in filename order, so
-- reusing the number would reorder an already-released sequence and replay an
-- applied filename. The CREATE TABLE below is kept so this file is
-- self-contained on a fresh database; on an existing one it is a no-op because
-- 002_core_schema.sql already created the table.

CREATE TABLE IF NOT EXISTS members (
  community_id    UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  stellar_address TEXT        NOT NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, stellar_address)
);

-- Membership rows are mutated in place (role changes, soft delete, re-adds), so
-- they need the same updated_at treatment as communities and tokens.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS members_updated_at ON members;
CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Shape check on the Stellar public key, mirroring the API-layer validation.
-- NOT VALID: new and updated rows are checked, pre-existing rows are left
-- alone so the migration cannot fail on legacy data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'members'::regclass
      AND conname = 'members_stellar_address_format'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_stellar_address_format
      CHECK (stellar_address ~ '^G[A-Z2-7]{55}$') NOT VALID;
  END IF;
END
$$;

-- "Which communities does this address belong to?" — the only members lookup
-- not served by the primary key.
CREATE INDEX IF NOT EXISTS idx_members_stellar_address
  ON members (stellar_address);

-- Every members read filters on deleted_at IS NULL and orders by joined_at.
CREATE INDEX IF NOT EXISTS idx_members_community_active
  ON members (community_id, joined_at)
  WHERE deleted_at IS NULL;

-- Redundant since 002: PRIMARY KEY (community_id, stellar_address) already
-- indexes community_id as its leading column, and the partial index above now
-- covers the live-member path.
DROP INDEX IF EXISTS idx_members_community;

COMMENT ON TABLE members IS
  'A Stellar address belonging to a community. Composite PK prevents duplicates.';
COMMENT ON COLUMN members.community_id IS
  'Owning community; cascades on community delete.';
COMMENT ON COLUMN members.stellar_address IS
  'Stellar ed25519 public key (G…56).';
COMMENT ON COLUMN members.deleted_at IS
  'Soft delete — set when a member is removed, cleared when re-added.';
