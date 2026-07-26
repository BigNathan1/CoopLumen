-- #035: multi-signature approval requests for community treasury actions.
--
-- Dormant until the multisig phase activates it. A request holds the proposed
-- Stellar transaction envelope while co-signers collect signatures on it; the
-- row is the off-chain coordination record, the network remains the authority
-- on whether the envelope is actually executable.
--
-- File numbering in this directory is sequential and does not track backlog
-- numbers, so this lands as 018 rather than 009.

CREATE TABLE IF NOT EXISTS multisig_requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id         UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  proposer_address     TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  title                TEXT        NOT NULL,
  description          TEXT,
  payload              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  transaction_xdr      TEXT,
  required_signatures  INTEGER     NOT NULL DEFAULT 2,
  current_signatures   INTEGER     NOT NULL DEFAULT 0,
  status               TEXT        NOT NULL DEFAULT 'pending',
  stellar_tx_hash      TEXT        UNIQUE,
  rejection_reason     TEXT,
  expires_at           TIMESTAMPTZ,
  executed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT multisig_requests_action_check
    CHECK (action IN (
      'payment',
      'token_issue',
      'trustline',
      'settings_update',
      'member_role_change',
      'signer_update'
    )),

  CONSTRAINT multisig_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled')),

  -- A threshold of zero would auto-approve every request, and collecting more
  -- signatures than the threshold means the counter drifted from reality.
  CONSTRAINT multisig_requests_signature_count_check
    CHECK (
      required_signatures >= 1
      AND current_signatures >= 0
      AND current_signatures <= required_signatures
    ),

  -- Only an executed request has an on-chain result, and it must have one.
  CONSTRAINT multisig_requests_executed_check
    CHECK (
      (status = 'executed' AND executed_at IS NOT NULL AND stellar_tx_hash IS NOT NULL)
      OR (status <> 'executed' AND executed_at IS NULL)
    )
);

-- The primary read is "open requests for my community", newest first.
CREATE INDEX IF NOT EXISTS idx_multisig_community_status
  ON multisig_requests(community_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_multisig_proposer
  ON multisig_requests(proposer_address);

-- The expiry sweep only ever looks at requests still awaiting signatures, so
-- keep the index to that slice rather than the whole table.
CREATE INDEX IF NOT EXISTS idx_multisig_pending_expiry
  ON multisig_requests(expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multisig_payload
  ON multisig_requests USING GIN (payload);

-- Dropped first so the whole file stays re-runnable; CREATE TRIGGER has no
-- IF NOT EXISTS form.
DROP TRIGGER IF EXISTS multisig_requests_updated_at ON multisig_requests;
CREATE TRIGGER multisig_requests_updated_at
  BEFORE UPDATE ON multisig_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
