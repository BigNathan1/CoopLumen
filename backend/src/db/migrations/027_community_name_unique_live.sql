-- Community names only need to be unique among live communities, compared the
-- same way the API checks them (trimmed, case-insensitive). The original
-- table-level UNIQUE(name) also covered soft-deleted rows, so a deleted
-- community's name could never be reused even though the API allowed it.
-- The index keeps the constraint's name so duplicate-name errors still map to 409.
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS communities_name_key
  ON communities (LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;
