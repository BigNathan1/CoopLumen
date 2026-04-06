CREATE TABLE IF NOT EXISTS community_settings (
  community_id  UUID        PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  settings      JSONB       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER community_settings_updated_at
  BEFORE UPDATE ON community_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
