-- Remove name and decimals columns from tokens table

DROP INDEX IF EXISTS idx_tokens_name;
ALTER TABLE tokens 
DROP COLUMN IF EXISTS decimals,
DROP COLUMN IF EXISTS name;