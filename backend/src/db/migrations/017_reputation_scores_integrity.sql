-- #034: complete the reputation_scores schema.
--
-- The table itself shipped earlier as 009_create_reputation_scores.sql; file
-- numbering in this directory is sequential and does not track backlog numbers.
-- This migration adds the pieces backlog #034 calls for that 009 left out:
-- counter integrity, a neutral starting score, and a leaderboard index.

-- #034a: a new member has no history, so their score starts at the neutral
-- midpoint the scoring formula converges on (100 * (0 + 1) / (0 + 0 + 2) = 50).
-- A default of 0 read as "worst possible borrower" for anyone who had simply
-- never borrowed. Existing rows keep whatever score was last calculated.
ALTER TABLE reputation_scores
  ALTER COLUMN score SET DEFAULT 50.00;

-- #034b: the counters are only ever incremented, so a negative value means a
-- bug upstream. Reject it at the storage layer rather than letting it skew
-- every score derived from it.
ALTER TABLE reputation_scores
  DROP CONSTRAINT IF EXISTS reputation_scores_counts_check;
ALTER TABLE reputation_scores
  ADD CONSTRAINT reputation_scores_counts_check
  CHECK (total_loans >= 0 AND on_time_repayments >= 0 AND defaults >= 0);

-- #034c: leaderboards read "top members of this community by score", which the
-- plain community_id index cannot serve without a sort. The composite index is
-- a strict superset of it, so drop the redundant one.
CREATE INDEX IF NOT EXISTS idx_reputation_community_score
  ON reputation_scores(community_id, score DESC);

DROP INDEX IF EXISTS idx_reputation_community;
