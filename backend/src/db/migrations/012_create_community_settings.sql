-- Matches the per-community JSON config table requested in issue #38. By the
-- time this file was added, `010_create_community_settings.sql` already
-- shipped the same table and `012` was already taken by
-- `012_create_notifications.sql`. Kept idempotent (IF NOT EXISTS) so it
-- applies cleanly to a fresh database and is a no-op on any environment that
-- already ran 010.
CREATE TABLE IF NOT EXISTS community_settings (
  community_id  UUID        PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  settings      JSONB       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The `community_settings_updated_at` trigger is created by
-- 010_create_community_settings.sql, which always runs before this file
-- (010 < 012). Not re-created here to avoid a duplicate-trigger error.
