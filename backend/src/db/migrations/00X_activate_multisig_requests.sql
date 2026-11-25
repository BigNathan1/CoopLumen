CREATE TABLE IF NOT EXISTS multisig_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  proposer_address  VARCHAR(56) NOT NULL,
  xdr               TEXT NOT NULL,
  tx_hash           VARCHAR(64) NOT NULL,
  description       TEXT,
  required_weight   INTEGER NOT NULL CHECK (required_weight > 0),
  collected_weight  INTEGER NOT NULL DEFAULT 0 CHECK (collected_weight >= 0),
  signatures        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            VARCHAR(24) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'ready', 'submitted', 'expired', 'cancelled')),
  expires_at        TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multisig_requests_community_status
  ON multisig_requests (community_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_multisig_requests_tx_hash
  ON multisig_requests (tx_hash);