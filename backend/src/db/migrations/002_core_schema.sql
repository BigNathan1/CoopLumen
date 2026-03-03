CREATE TABLE IF NOT EXISTS communities (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL UNIQUE,
  description      TEXT,
  issuer_public_key TEXT       NOT NULL,
  asset_code       TEXT        NOT NULL,
  asset_issuer     TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  community_id     UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  stellar_address  TEXT        NOT NULL,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, stellar_address)
);

CREATE TABLE IF NOT EXISTS loans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID        NOT NULL REFERENCES communities(id),
  borrower_address TEXT        NOT NULL,
  lender_address   TEXT        NOT NULL,
  amount           NUMERIC(20, 7) NOT NULL,
  asset_code       TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  due_at           TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_community ON members(community_id);
CREATE INDEX IF NOT EXISTS idx_loans_community   ON loans(community_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrower    ON loans(borrower_address);
CREATE INDEX IF NOT EXISTS idx_loans_lender      ON loans(lender_address);
