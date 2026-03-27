CREATE TABLE IF NOT EXISTS reputation_scores (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_address     TEXT           NOT NULL,
  community_id        UUID           NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  score               NUMERIC(5, 2)  NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  total_loans         INTEGER        NOT NULL DEFAULT 0,
  on_time_repayments  INTEGER        NOT NULL DEFAULT 0,
  defaults            INTEGER        NOT NULL DEFAULT 0,
  last_calculated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (stellar_address, community_id)
);

CREATE INDEX IF NOT EXISTS idx_reputation_address   ON reputation_scores(stellar_address);
CREATE INDEX IF NOT EXISTS idx_reputation_community ON reputation_scores(community_id);

CREATE TRIGGER reputation_scores_updated_at
  BEFORE UPDATE ON reputation_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
