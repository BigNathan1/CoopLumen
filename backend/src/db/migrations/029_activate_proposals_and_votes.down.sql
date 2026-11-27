-- Rollback for 029_activate_proposals_and_votes.sql.
-- Preserves existing proposal and vote rows while resetting comments to preparation state.

COMMENT ON TABLE proposals IS
  'Governance proposal raised inside a community; dormant until the governance phase activates it.';
COMMENT ON TABLE votes IS
  'Ballot cast against a proposal; one row per voter per proposal, updated in place when a voter changes their mind.';
