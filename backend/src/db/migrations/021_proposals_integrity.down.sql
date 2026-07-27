-- Drops the constraints and comments added by 021_proposals_integrity.sql.
-- The type, status, quorum, voting-window and title checks are owned by
-- 017_create_proposals.sql and stay put.
ALTER TABLE proposals
  DROP CONSTRAINT IF EXISTS proposals_proposer_address_format,
  DROP CONSTRAINT IF EXISTS proposals_title_length,
  DROP CONSTRAINT IF EXISTS proposals_description_length,
  DROP CONSTRAINT IF EXISTS proposals_executed_at_check;

COMMENT ON TABLE proposals IS NULL;
COMMENT ON COLUMN proposals.community_id IS NULL;
COMMENT ON COLUMN proposals.proposer_address IS NULL;
COMMENT ON COLUMN proposals.type IS NULL;
COMMENT ON COLUMN proposals.status IS NULL;
COMMENT ON COLUMN proposals.quorum_percent IS NULL;
COMMENT ON COLUMN proposals.metadata IS NULL;
COMMENT ON COLUMN proposals.voting_ends_at IS NULL;
COMMENT ON COLUMN proposals.executed_at IS NULL;
COMMENT ON COLUMN proposals.stellar_tx_hash IS NULL;
