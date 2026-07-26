CREATE INDEX IF NOT EXISTS idx_reputation_community ON reputation_scores(community_id);

DROP INDEX IF EXISTS idx_reputation_community_score;

ALTER TABLE reputation_scores
  DROP CONSTRAINT IF EXISTS reputation_scores_counts_check;

ALTER TABLE reputation_scores
  ALTER COLUMN score SET DEFAULT 0;
