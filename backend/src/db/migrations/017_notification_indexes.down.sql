-- Restores the index set defined in 012_create_notifications.sql.
DROP INDEX IF EXISTS idx_notifications_address_created;
CREATE INDEX IF NOT EXISTS idx_notifications_address
  ON notifications (stellar_address);

DROP INDEX IF EXISTS idx_notifications_unread;
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (stellar_address, read_at)
  WHERE read_at IS NULL;
