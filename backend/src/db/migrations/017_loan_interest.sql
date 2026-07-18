-- #055: flat interest rate (percent of principal) on loans
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 0
  CHECK (interest_rate >= 0 AND interest_rate <= 1000);

-- #056: a borrower repays principal plus interest, so the repaid ceiling is the
-- total due (principal * (1 + rate/100)), not the bare principal.
ALTER TABLE loans
  DROP CONSTRAINT IF EXISTS loans_amount_repaid_check;
ALTER TABLE loans
  ADD CONSTRAINT loans_amount_repaid_check
  CHECK (amount_repaid >= 0 AND amount_repaid <= amount * (1 + interest_rate / 100));
