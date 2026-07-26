-- #040: index hygiene for the notifications table
--
-- Index-only migration. The notifications table is still dormant (no route
-- reads it yet), so nothing here touches rows, columns or constraints.

-- idx_notifications_unread indexed read_at inside a `WHERE read_at IS NULL`
-- partial index. Every row reachable through that index has read_at = NULL by
-- definition, so the column stores no information and only widens each entry.
-- Replace it with created_at, which is the ordering the unread feed needs.
DROP INDEX IF EXISTS idx_notifications_unread;
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (stellar_address, created_at DESC)
  WHERE read_at IS NULL;

-- Recipient feed, newest first. idx_notifications_address covers the equality
-- on stellar_address but leaves the sort unindexed. This composite serves the
-- filter and the ordering together, and its leading column makes the
-- single-column index redundant.
CREATE INDEX IF NOT EXISTS idx_notifications_address_created
  ON notifications (stellar_address, created_at DESC);
DROP INDEX IF EXISTS idx_notifications_address;
