-- Backlog #036: governance proposals (Phase 3 prep).
-- Dormant until the governance phase activates it; no API reads this table yet.
-- Numbered 017 because 010 is already taken by 010_create_community_settings.sql.

CREATE TABLE IF NOT EXISTS proposals (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID           NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  proposer_address  TEXT           NOT NULL,
  title             TEXT           NOT NULL,
  description       TEXT,
  type              TEXT           NOT NULL DEFAULT 'general',
  status            TEXT           NOT NULL DEFAULT 'draft',
  quorum_percent    NUMERIC(5, 2)  NOT NULL DEFAULT 50,
  metadata          JSONB,
  voting_starts_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  voting_ends_at    TIMESTAMPTZ    NOT NULL,
  executed_at       TIMESTAMPTZ,
  stellar_tx_hash   TEXT           UNIQUE,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT proposals_type_check CHECK (
    type IN (
      'general',
      'loan_approval',
      'member_removal',
      'treasury_spend',
      'settings_change',
      'token_issuance'
    )
  ),
  CONSTRAINT proposals_status_check CHECK (
    status IN ('draft', 'active', 'passed', 'rejected', 'executed', 'cancelled')
  ),
  CONSTRAINT proposals_quorum_percent_check CHECK (quorum_percent >= 0 AND quorum_percent <= 100),
  CONSTRAINT proposals_voting_window_check CHECK (voting_ends_at > voting_starts_at),
  CONSTRAINT proposals_title_check CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_proposals_community        ON proposals(community_id);
CREATE INDEX IF NOT EXISTS idx_proposals_proposer         ON proposals(proposer_address);
CREATE INDEX IF NOT EXISTS idx_proposals_community_status ON proposals(community_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_open_voting      ON proposals(voting_ends_at) WHERE status = 'active';

-- Idempotent trigger creation: PostgreSQL has no CREATE TRIGGER IF NOT EXISTS.
DROP TRIGGER IF EXISTS proposals_updated_at ON proposals;
CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
