-- #083: community avatar image URL
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
