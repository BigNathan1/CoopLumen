-- Matches the loan events / repayments audit trail table requested in issue #33.
-- By the time this file was added, `006_loan_events.sql` already shipped the same
-- table and `007` was already taken by `007_create_tokens.sql`. Kept idempotent
-- (IF NOT EXISTS) so it applies cleanly to a fresh database and is a no-op on any
-- environment that already ran 006.
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
