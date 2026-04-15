-- #044: soft-delete on communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- #045: soft-delete on members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- #047: GIN full-text search index on communities
CREATE INDEX IF NOT EXISTS idx_communities_fts
  ON communities
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));
