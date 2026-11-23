-- Activate the proposals and votes tables prepared in Phase 3.
-- Forward-only and idempotent: ensures tables, constraints, indexes, triggers,
-- and comments are active and verified without disturbing existing data.

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
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID           NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  voter_address    TEXT           NOT NULL,
  choice           TEXT           NOT NULL,
  weight           NUMERIC(20, 7) NOT NULL DEFAULT 1,
  reason           TEXT,
  stellar_tx_hash  TEXT           UNIQUE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_type_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_type_check CHECK (
      type IN (
        'general',
        'loan_approval',
        'member_removal',
        'treasury_spend',
        'settings_change',
        'token_issuance'
      )
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_status_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_status_check CHECK (
      status IN ('draft', 'active', 'passed', 'rejected', 'executed', 'cancelled')
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_quorum_percent_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_quorum_percent_check CHECK (
      quorum_percent >= 0 AND quorum_percent <= 100
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_voting_window_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_voting_window_check CHECK (
      voting_ends_at > voting_starts_at
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_title_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_title_check CHECK (
      length(btrim(title)) > 0
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_proposer_address_format'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_proposer_address_format CHECK (
      proposer_address ~ '^G[A-Z2-7]{55}$'
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_title_length'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_title_length CHECK (
      char_length(title) <= 200
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_description_length'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_description_length CHECK (
      char_length(description) <= 10000
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'proposals'::regclass
       AND conname = 'proposals_executed_at_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_executed_at_check CHECK (
      executed_at IS NULL OR (executed_at >= voting_starts_at AND status IN ('passed', 'executed'))
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_choice_check'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_choice_check CHECK (
      choice IN ('for', 'against', 'abstain')
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_weight_check'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_weight_check CHECK (
      weight >= 0
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_unique_per_voter'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_unique_per_voter UNIQUE (proposal_id, voter_address);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_voter_address_format'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_voter_address_format CHECK (
      voter_address ~ '^G[A-Z2-7]{55}$'
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_weight_upper_bound'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_weight_upper_bound CHECK (
      weight <= 1000000000000
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'votes'::regclass
       AND conname = 'votes_reason_length'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_reason_length CHECK (
      char_length(reason) <= 2000
    ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposals_community        ON proposals(community_id);
CREATE INDEX IF NOT EXISTS idx_proposals_proposer         ON proposals(proposer_address);
CREATE INDEX IF NOT EXISTS idx_proposals_community_status ON proposals(community_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_open_voting      ON proposals(voting_ends_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_votes_proposal        ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter           ON votes(voter_address);
CREATE INDEX IF NOT EXISTS idx_votes_proposal_choice ON votes(proposal_id, choice);

DROP TRIGGER IF EXISTS proposals_updated_at ON proposals;
CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS votes_updated_at ON votes;
CREATE TRIGGER votes_updated_at
  BEFORE UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE proposals IS
  'Active Phase 3 governance proposals raised inside a community.';
COMMENT ON TABLE votes IS
  'Active Phase 3 ballots cast against a governance proposal.';
