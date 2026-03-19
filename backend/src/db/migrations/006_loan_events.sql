CREATE TABLE IF NOT EXISTS loan_events (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     UUID           NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  event_type  TEXT           NOT NULL,
  amount      NUMERIC(20, 7),
  payment_id  UUID           REFERENCES payments(id),
  note        TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT loan_events_event_type_check
    CHECK (event_type IN ('created', 'disbursed', 'repayment', 'closed', 'defaulted'))
);

CREATE INDEX IF NOT EXISTS idx_loan_events_loan ON loan_events(loan_id);
