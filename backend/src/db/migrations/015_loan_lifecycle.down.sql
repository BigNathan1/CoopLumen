DROP INDEX IF EXISTS idx_loans_status;
DROP TRIGGER IF EXISTS loans_updated_at ON loans;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_amount_repaid_check;
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS disbursed_at,
  DROP COLUMN IF EXISTS amount_repaid,
  DROP COLUMN IF EXISTS asset_issuer,
  DROP COLUMN IF EXISTS purpose;
