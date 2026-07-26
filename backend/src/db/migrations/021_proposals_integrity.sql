-- #036 follow-up: proposals table integrity constraints and documentation.
--
-- 017_create_proposals.sql created the table with the type, status, quorum,
-- voting-window and title checks. What is still missing is the integrity layer
-- the other tables already carry: a Stellar address format check (members got
-- one in 017_members_integrity.sql, notifications in
-- 020_notifications_integrity.sql), bounds on the free-text columns, a guard
-- tying executed_at to the voting window, and table/column comments.
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
      -- The author is a Stellar ed25519 public key, the same shape members and
      -- communities already enforce.
      ('proposals_proposer_address_format',
       'proposer_address ~ ''^G[A-Z2-7]{55}$'''),
      -- Bound the free-text columns so a single proposal cannot bloat the row.
      -- communities applies the same treatment to name and description.
      ('proposals_title_length',
       'char_length(title) <= 200'),
      ('proposals_description_length',
       'char_length(description) <= 10000'),
      -- A proposal cannot have been executed before voting opened, and only a
      -- settled proposal can carry an execution timestamp.
      ('proposals_executed_at_check',
       'executed_at IS NULL OR (executed_at >= voting_starts_at AND status IN (''passed'', ''executed''))')
    ) AS c(constraint_name, check_expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'proposals'::regclass
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE proposals ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        spec.constraint_name,
        spec.check_expression
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE proposals IS
  'Governance proposal raised inside a community; dormant until the governance phase activates it.';
COMMENT ON COLUMN proposals.community_id IS
  'Owning community. Cascades on community delete.';
COMMENT ON COLUMN proposals.proposer_address IS
  'Author Stellar ed25519 public key (G…56).';
COMMENT ON COLUMN proposals.type IS
  'Proposal category, constrained by proposals_type_check.';
COMMENT ON COLUMN proposals.status IS
  'Lifecycle state, constrained by proposals_status_check.';
COMMENT ON COLUMN proposals.quorum_percent IS
  'Share of voting weight required to pass, captured per proposal so a later change to the community default cannot move the bar for a ballot already in flight.';
COMMENT ON COLUMN proposals.metadata IS
  'Type-specific payload (target loan, spend amount, settings patch, and so on).';
COMMENT ON COLUMN proposals.voting_ends_at IS
  'Close of the ballot; must be later than voting_starts_at.';
COMMENT ON COLUMN proposals.executed_at IS
  'When the outcome was applied on-chain; NULL until execution.';
COMMENT ON COLUMN proposals.stellar_tx_hash IS
  'Execution transaction hash; unique when present.';
