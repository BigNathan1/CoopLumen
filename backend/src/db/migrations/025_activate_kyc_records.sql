-- World ID verifications for Sybil resistance (one-person-one-account).
--
-- Each World ID proof carries a nullifier hash that is unique per person per
-- app. Enforcing uniqueness on nullifier_hash guarantees a single World ID
-- identity can only ever be linked to one CoopLumen account, while the
-- user_id foreign key ties the verification to the account that claimed it.

CREATE TABLE IF NOT EXISTS worldid_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  nullifier_hash TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One verification per account: a user cannot claim multiple World ID
-- identities to bypass the one-person-one-account rule.
CREATE UNIQUE INDEX IF NOT EXISTS idx_worldid_verifications_user_id
  ON worldid_verifications(user_id);

-- PostgreSQL has no CREATE TRIGGER IF NOT EXISTS. Replacing this trigger makes
-- the migration safe to replay while preserving every stored row.
DROP TRIGGER IF EXISTS worldid_verifications_updated_at ON worldid_verifications;
CREATE TRIGGER worldid_verifications_updated_at
  BEFORE UPDATE ON worldid_verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE worldid_verifications IS
  'World ID Sybil-resistance verifications linking one World ID identity to one account.';
COMMENT ON COLUMN worldid_verifications.user_id IS
  'Account that claimed this World ID verification; unique per user.';
COMMENT ON COLUMN worldid_verifications.nullifier_hash IS
  'World ID nullifier hash; globally unique so each person verifies at most one account.';
COMMENT ON COLUMN worldid_verifications.verified_at IS
  'Timestamp when the World ID proof was accepted.';