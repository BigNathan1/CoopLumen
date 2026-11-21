-- Activate the Phase 2 reputation read model. Earlier migrations created and
-- hardened the table; this forward-only activation safely seeds missing rows
-- from existing loan history without replacing any score already calculated.

CREATE TABLE IF NOT EXISTS reputation_scores (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_address     TEXT          NOT NULL,
  community_id        UUID          NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  score               NUMERIC(5, 2) NOT NULL DEFAULT 50.00 CHECK (score >= 0 AND score <= 100),
  total_loans         INTEGER       NOT NULL DEFAULT 0,
  on_time_repayments  INTEGER       NOT NULL DEFAULT 0,
  defaults            INTEGER       NOT NULL DEFAULT 0,
  last_calculated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (stellar_address, community_id)
);

INSERT INTO reputation_scores (
  stellar_address,
  community_id,
  score,
  total_loans,
  on_time_repayments,
  defaults,
  last_calculated_at
)
SELECT
  borrower_address,
  community_id,
  ROUND(
    100.0 * (COUNT(*) FILTER (WHERE status = 'repaid') + 1)
      / (COUNT(*) FILTER (WHERE status IN ('repaid', 'defaulted')) + 2),
    2
  ),
  COUNT(*)::integer,
  COUNT(*) FILTER (WHERE status = 'repaid')::integer,
  COUNT(*) FILTER (WHERE status = 'defaulted')::integer,
  NOW()
FROM loans
GROUP BY borrower_address, community_id
ON CONFLICT (stellar_address, community_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_reputation_address
  ON reputation_scores(stellar_address);
CREATE INDEX IF NOT EXISTS idx_reputation_community_score
  ON reputation_scores(community_id, score DESC);

DROP TRIGGER IF EXISTS reputation_scores_updated_at ON reputation_scores;
CREATE TRIGGER reputation_scores_updated_at
  BEFORE UPDATE ON reputation_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE reputation_scores IS
  'Active Phase 2 lending reputation read model, derived from repayment and default history.';
