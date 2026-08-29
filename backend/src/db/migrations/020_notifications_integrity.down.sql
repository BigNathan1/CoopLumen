-- Drops the constraints and comments added by 020_notifications_integrity.sql.
-- The type constraint and the indexes are owned by 012 and 017 and stay put.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_stellar_address_format,
  DROP CONSTRAINT IF EXISTS notifications_read_at_check,
  DROP CONSTRAINT IF EXISTS notifications_title_check;

COMMENT ON TABLE notifications IS NULL;
COMMENT ON COLUMN notifications.stellar_address IS NULL;
COMMENT ON COLUMN notifications.community_id IS NULL;
COMMENT ON COLUMN notifications.type IS NULL;
COMMENT ON COLUMN notifications.metadata IS NULL;
COMMENT ON COLUMN notifications.read_at IS NULL;
