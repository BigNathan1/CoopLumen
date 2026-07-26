-- #041: kyc_records table (Phase 4 prep) — dormant until SEP-12 KYC integration activates it
CREATE TABLE IF NOT EXISTS kyc_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  stellar_address     TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  provider            TEXT,
  provider_reference  TEXT,
  verified_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kyc_records_status_check CHECK (
    status IN ('pending', 'submitted', 'verified', 'rejected', 'expired')
  ),
  UNIQUE (community_id, stellar_address)
);

CREATE INDEX IF NOT EXISTS idx_kyc_records_community ON kyc_records(community_id);
CREATE INDEX IF NOT EXISTS idx_kyc_records_address   ON kyc_records(stellar_address);
CREATE INDEX IF NOT EXISTS idx_kyc_records_status    ON kyc_records(status);

CREATE TRIGGER kyc_records_updated_at
  BEFORE UPDATE ON kyc_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
