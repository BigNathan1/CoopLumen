DROP INDEX IF EXISTS idx_loans_escrow_balance_id;
ALTER TABLE loans DROP COLUMN IF EXISTS escrow_balance_id;
