-- Reverses 002_create_communities.sql only. The `communities` table itself and
-- the `deleted_at` / `avatar_url` columns belong to 002_core_schema,
-- 014_soft_delete_and_search and 016_community_avatar, so they are left alone.

DROP INDEX IF EXISTS idx_communities_asset;
DROP INDEX IF EXISTS idx_communities_active_created_at;

ALTER TABLE communities
  DROP CONSTRAINT IF EXISTS communities_avatar_url_check,
  DROP CONSTRAINT IF EXISTS communities_asset_issuer_check,
  DROP CONSTRAINT IF EXISTS communities_issuer_public_key_check,
  DROP CONSTRAINT IF EXISTS communities_asset_code_check,
  DROP CONSTRAINT IF EXISTS communities_description_check,
  DROP CONSTRAINT IF EXISTS communities_name_check;

COMMENT ON TABLE communities IS NULL;
COMMENT ON COLUMN communities.issuer_public_key IS NULL;
COMMENT ON COLUMN communities.asset_code IS NULL;
COMMENT ON COLUMN communities.deleted_at IS NULL;
