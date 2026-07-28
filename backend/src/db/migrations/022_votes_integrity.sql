-- #037 follow-up: votes table integrity constraints and documentation.
--
-- 018_create_votes.sql created the table with the choice enum, the weight
-- floor, and the one-ballot-per-voter unique constraint. What is still missing
-- is the integrity layer the other tables already carry: a Stellar address
-- format check (members got one in 017_members_integrity.sql, notifications in
-- 020_notifications_integrity.sql), a bound on the free-text rationale, an
-- upper bound on the weight, and table/column comments.
--
-- Additive and idempotent: no rows, columns or indexes change.

-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is guarded by a
-- pg_constraint lookup, matching the pattern in 020_notifications_integrity.sql.
--
-- NOT VALID for the same reason 017_members_integrity.sql uses it: new and
-- updated rows are checked, while any pre-existing row is left alone so the
-- migration cannot fail on legacy data. The table is dormant today, but the
-- migration must not assume that of every environment.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      -- The voter is a Stellar ed25519 public key, the same shape members and
      -- communities already enforce.
      ('votes_voter_address_format',
       'voter_address ~ ''^G[A-Z2-7]{55}$'''),
      -- votes_weight_check already forbids a negative weight. NUMERIC(20,7)
      -- still admits 13 digits of integer part, far beyond any real token
      -- balance; cap it so a fat-fingered weight cannot swamp a tally.
      ('votes_weight_upper_bound',
       'weight <= 1000000000000'),
      -- Bound the free-text rationale so a single ballot cannot bloat the row.
      ('votes_reason_length',
       'char_length(reason) <= 2000')
    ) AS c(constraint_name, check_expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'votes'::regclass
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE votes ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        spec.constraint_name,
        spec.check_expression
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE votes IS
  'Ballot cast against a proposal; one row per voter per proposal, updated in place when a voter changes their mind.';
COMMENT ON COLUMN votes.proposal_id IS
  'Proposal being voted on. Cascades on proposal delete, and transitively on community delete.';
COMMENT ON COLUMN votes.voter_address IS
  'Voter Stellar ed25519 public key (G…56).';
COMMENT ON COLUMN votes.choice IS
  'Ballot direction, constrained by votes_choice_check.';
COMMENT ON COLUMN votes.weight IS
  'Voting weight applied to the tally; 1 for one-member-one-vote communities, a token balance for weighted governance.';
COMMENT ON COLUMN votes.reason IS
  'Optional rationale shown alongside the tally.';
COMMENT ON COLUMN votes.stellar_tx_hash IS
  'On-chain vote transaction hash; unique when present.';
COMMENT ON COLUMN votes.updated_at IS
  'Last write; reflects when the voter last changed their ballot.';
