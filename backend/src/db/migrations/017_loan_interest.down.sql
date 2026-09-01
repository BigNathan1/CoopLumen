-- Restore the principal-only repaid ceiling, then drop the interest column.
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_amount_repaid_check;
ALTER TABLE loans DROP COLUMN IF EXISTS interest_rate;
ALTER TABLE loans
  ADD CONSTRAINT loans_amount_repaid_check
  CHECK (amount_repaid >= 0 AND amount_repaid <= amount);
