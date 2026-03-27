CREATE TABLE IF NOT EXISTS transactions_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID        REFERENCES communities(id),
  actor_address    TEXT,
  action           TEXT        NOT NULL,
  stellar_tx_hash  TEXT        UNIQUE,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_log_action_check CHECK (
    action IN (
      'community_created',
      'member_added',
      'member_removed',
      'token_issued',
      'payment_sent',
      'trustline_established',
      'trustline_removed',
      'loan_created',
      'loan_disbursed',
      'loan_repayment',
      'loan_closed',
      'loan_defaulted'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_txlog_community_time ON transactions_log(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txlog_actor         ON transactions_log(actor_address);
CREATE INDEX IF NOT EXISTS idx_txlog_action        ON transactions_log(action);
CREATE INDEX IF NOT EXISTS idx_txlog_metadata      ON transactions_log USING GIN (metadata);
