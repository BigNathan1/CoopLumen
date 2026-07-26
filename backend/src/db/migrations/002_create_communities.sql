-- #028: canonical `communities` schema.
--
-- This file has to be history-independent. On a fresh database it runs directly
-- after 002_core_schema.sql; on an already-migrated database it runs after
-- 016_community_avatar.sql, once the table already carries `deleted_at` and
-- `avatar_url`. Every statement below is therefore additive and idempotent, so
-- the end state is identical either way.

CREATE TABLE IF NOT EXISTS communities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL UNIQUE,
  description       TEXT,
  issuer_public_key TEXT        NOT NULL,
  asset_code        TEXT        NOT NULL,
  asset_issuer      TEXT        NOT NULL,
  avatar_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- Columns owned by 014_soft_delete_and_search and 016_community_avatar. Named
-- here as well so the table reaches its full shape whichever migration lands
-- first; those files keep their own ADD COLUMN IF NOT EXISTS statements.
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Integrity constraints mirroring the request validation in
-- backend/src/api/schemas/community.ts, so rows written by anything other than
-- the API (seeds, migrations, manual fixes) obey the same rules.
--
-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is guarded by a pg_constraint
-- lookup to keep the migration re-runnable.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      ('communities_name_check',
       'char_length(btrim(name)) BETWEEN 2 AND 64'),
      ('communities_description_check',
       'description IS NULL OR char_length(description) <= 500'),
      -- Stellar supports alphanum4 and alphanum12 asset codes only.
      ('communities_asset_code_check',
       'asset_code ~ ''^[A-Za-z0-9]{1,12}$'''),
      ('communities_issuer_public_key_check',
       'issuer_public_key ~ ''^G[A-Z2-7]{55}$'''),
      ('communities_asset_issuer_check',
       'asset_issuer ~ ''^G[A-Z2-7]{55}$'''),
      ('communities_avatar_url_check',
       'avatar_url IS NULL OR char_length(avatar_url) <= 2048')
    ) AS c(constraint_name, check_expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'communities'::regclass
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE communities ADD CONSTRAINT %I CHECK (%s)',
        spec.constraint_name,
        spec.check_expression
      );
    END IF;
  END LOOP;
END $$;

-- Default listing is `WHERE deleted_at IS NULL ORDER BY created_at DESC`; the
-- partial index keeps soft-deleted rows out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_communities_active_created_at
  ON communities (created_at DESC)
  WHERE deleted_at IS NULL;

-- Resolving a community from the Stellar asset it issues.
CREATE INDEX IF NOT EXISTS idx_communities_asset
  ON communities (asset_code, asset_issuer);

COMMENT ON TABLE communities IS
  'A registered cooperative community. Each community maps to one Stellar custom asset.';
COMMENT ON COLUMN communities.issuer_public_key IS
  'Stellar account that controls the asset (G… address).';
COMMENT ON COLUMN communities.asset_code IS
  'Stellar asset code, 1-12 alphanumeric characters.';
COMMENT ON COLUMN communities.deleted_at IS
  'Soft-delete marker; NULL means the community is active.';
