CREATE TABLE IF NOT EXISTS payments (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID           REFERENCES communities(id),
  loan_id           UUID           REFERENCES loans(id),
  sender_address    TEXT           NOT NULL,
  recipient_address TEXT           NOT NULL,
  asset_code        TEXT           NOT NULL,
  asset_issuer      TEXT,
  amount            NUMERIC(20, 7) NOT NULL,
  stellar_tx_hash   TEXT           UNIQUE,
  memo              TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_community  ON payments(community_id);
CREATE INDEX IF NOT EXISTS idx_payments_loan       ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_sender     ON payments(sender_address);
CREATE INDEX IF NOT EXISTS idx_payments_recipient  ON payments(recipient_address);
