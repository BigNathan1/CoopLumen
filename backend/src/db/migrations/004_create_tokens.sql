-- Matches the on-chain token metadata table requested in issue #30. By the
-- time this file was added, `007_create_tokens.sql` already shipped the same
-- table and `004` was already taken by `004_payments.sql`. This is kept
-- idempotent (IF NOT EXISTS) so it applies cleanly to a fresh database and is
-- a no-op on any environment that already ran 007.
CREATE TABLE IF NOT EXISTS tokens (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id          UUID           NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  asset_code            TEXT           NOT NULL,
  asset_issuer          TEXT           NOT NULL,
  distributor_address   TEXT           NOT NULL,
  total_supply          NUMERIC(20, 7) NOT NULL DEFAULT 0,
  description           TEXT,
  icon_url              TEXT,
  stellar_tx_hash       TEXT           UNIQUE,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (asset_code, asset_issuer)
);

CREATE INDEX IF NOT EXISTS idx_tokens_community ON tokens(community_id);

-- The `tokens_updated_at` trigger is created by 007_create_tokens.sql, which
-- always runs after this file. Not created here so a fresh database doesn't
-- hit a duplicate-trigger error when 007 runs its own CREATE TRIGGER.
