CREATE TABLE IF NOT EXISTS trustlines (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_address  TEXT           NOT NULL,
  asset_code       TEXT           NOT NULL,
  asset_issuer     TEXT           NOT NULL,
  limit_amount     NUMERIC(20, 7),
  stellar_tx_hash  TEXT           UNIQUE,
  established_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  removed_at       TIMESTAMPTZ,
  UNIQUE (stellar_address, asset_code, asset_issuer)
);

CREATE INDEX IF NOT EXISTS idx_trustlines_address ON trustlines(stellar_address);
CREATE INDEX IF NOT EXISTS idx_trustlines_asset   ON trustlines(asset_code, asset_issuer);
