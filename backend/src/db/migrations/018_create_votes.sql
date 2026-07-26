-- Backlog #037: ballots cast against a governance proposal.
-- Dormant until the governance phase activates it; no API reads this table yet.
-- Numbered 018 because 011 is already taken by 011_create_member_roles.sql.
-- Depends on 017_create_proposals.sql for the proposal_id foreign key.

CREATE TABLE IF NOT EXISTS votes (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID           NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  voter_address    TEXT           NOT NULL,
  choice           TEXT           NOT NULL,
  weight           NUMERIC(20, 7) NOT NULL DEFAULT 1,
  reason           TEXT,
  stellar_tx_hash  TEXT           UNIQUE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT votes_choice_check CHECK (choice IN ('for', 'against', 'abstain')),
  CONSTRAINT votes_weight_check CHECK (weight >= 0),
  CONSTRAINT votes_unique_per_voter UNIQUE (proposal_id, voter_address)
);

CREATE INDEX IF NOT EXISTS idx_votes_proposal        ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter           ON votes(voter_address);
CREATE INDEX IF NOT EXISTS idx_votes_proposal_choice ON votes(proposal_id, choice);

-- Idempotent trigger creation: PostgreSQL has no CREATE TRIGGER IF NOT EXISTS.
DROP TRIGGER IF EXISTS votes_updated_at ON votes;
CREATE TRIGGER votes_updated_at
  BEFORE UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
