-- Disbursing a loan locks the lender's funds in a Stellar claimable balance
-- that the borrower claims once the loan is active. The route records that
-- balance's id on the loan so it can be traced on the network later.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS escrow_balance_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_escrow_balance_id
  ON loans (escrow_balance_id)
  WHERE escrow_balance_id IS NOT NULL;
