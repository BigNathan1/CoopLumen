-- Drops the constraints and comments added by 022_votes_integrity.sql.
-- The choice enum, the weight floor and the one-ballot-per-voter unique
-- constraint are owned by 018_create_votes.sql and stay put.
ALTER TABLE votes
  DROP CONSTRAINT IF EXISTS votes_voter_address_format,
  DROP CONSTRAINT IF EXISTS votes_weight_upper_bound,
  DROP CONSTRAINT IF EXISTS votes_reason_length;

COMMENT ON TABLE votes IS NULL;
COMMENT ON COLUMN votes.proposal_id IS NULL;
COMMENT ON COLUMN votes.voter_address IS NULL;
COMMENT ON COLUMN votes.choice IS NULL;
COMMENT ON COLUMN votes.weight IS NULL;
COMMENT ON COLUMN votes.reason IS NULL;
COMMENT ON COLUMN votes.stellar_tx_hash IS NULL;
COMMENT ON COLUMN votes.updated_at IS NULL;
