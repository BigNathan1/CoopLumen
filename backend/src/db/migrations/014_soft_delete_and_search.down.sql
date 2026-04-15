DROP INDEX IF EXISTS idx_communities_fts;
ALTER TABLE members    DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE communities DROP COLUMN IF EXISTS deleted_at;
