CREATE TABLE IF NOT EXISTS notifications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_address  TEXT        NOT NULL,
  community_id     UUID        REFERENCES communities(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  body             TEXT,
  metadata         JSONB,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_type_check CHECK (
    type IN (
      'loan_request',
      'loan_funded',
      'loan_repayment',
      'loan_overdue',
      'loan_defaulted',
      'member_added',
      'token_issued',
      'payment_received',
      'proposal_created',
      'proposal_passed',
      'proposal_rejected'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_address     ON notifications(stellar_address);
CREATE INDEX IF NOT EXISTS idx_notifications_community   ON notifications(community_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread      ON notifications(stellar_address, read_at) WHERE read_at IS NULL;
