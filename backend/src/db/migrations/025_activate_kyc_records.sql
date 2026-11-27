-- Activate the KYC records prepared by 017_create_kyc_records.sql without
-- rewriting that checksum-protected migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'kyc_records'::regclass
       AND conname = 'kyc_records_stellar_address_format'
  ) THEN
    ALTER TABLE kyc_records
      ADD CONSTRAINT kyc_records_stellar_address_format
      CHECK (stellar_address ~ '^G[A-Z2-7]{55}$') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kyc_records_address_updated
  ON kyc_records(stellar_address, updated_at DESC, created_at DESC);

-- PostgreSQL has no CREATE TRIGGER IF NOT EXISTS. Replacing this trigger makes
-- the activation file safe to replay while preserving every stored row.
DROP TRIGGER IF EXISTS kyc_records_updated_at ON kyc_records;
CREATE TRIGGER kyc_records_updated_at
  BEFORE UPDATE ON kyc_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE kyc_records IS
  'Active per-community KYC verification state for Stellar accounts.';
COMMENT ON COLUMN kyc_records.stellar_address IS
  'Stellar ed25519 public key, validated for new and updated rows.';

-- World ID verifications for Sybil resistance (one-person-one-account).

CREATE TABLE IF NOT EXISTS worldid_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  nullifier_hash TEXT NOT NULL UNIQUE,
  verification_level TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worldid_verifications_user_id
  ON worldid_verifications(user_id);

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
