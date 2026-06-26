-- #050: lifecycle columns for the loans table
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS purpose       TEXT,
  ADD COLUMN IF NOT EXISTS asset_issuer  TEXT,
  ADD COLUMN IF NOT EXISTS amount_repaid NUMERIC(20, 7) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disbursed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- #051: constrain loan status to the lifecycle states
ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans
  ADD CONSTRAINT loans_status_check
  CHECK (status IN ('pending', 'active', 'repaid', 'defaulted', 'cancelled'));

-- #052: keep amount_repaid within bounds
ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_amount_repaid_check;
ALTER TABLE loans
  ADD CONSTRAINT loans_amount_repaid_check
  CHECK (amount_repaid >= 0 AND amount_repaid <= amount);

-- #053: maintain updated_at on write
CREATE TRIGGER loans_updated_at
  BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- #054: index for status filtering and lender/borrower dashboards
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
