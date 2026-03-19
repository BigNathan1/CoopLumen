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

CREATE TRIGGER tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
