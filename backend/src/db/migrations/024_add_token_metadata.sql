-- Add name and decimals columns to tokens table for metadata storage
-- name: human-readable token name
-- decimals: number of decimal places for the token (0-7 is typical for Stellar)

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS decimals INTEGER DEFAULT 7 CHECK (decimals >= 0 AND decimals <= 7);

-- Create index for name searches
CREATE INDEX IF NOT EXISTS idx_tokens_name ON tokens(name) WHERE name IS NOT NULL;