-- #040: notifications table integrity constraints and documentation.
--
-- 012_create_notifications.sql created the table and constrained `type`, and
-- 017_notification_indexes.sql tuned the indexes. What is still missing is the
-- integrity layer the other tables already carry: a Stellar address format
-- check (members got one in 017_members_integrity.sql, communities in
-- 002_create_communities.sql), a guard against a notification being marked read
-- before it existed, and table/column comments.
--
-- Additive and idempotent: no rows, columns or indexes change.

-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is guarded by a
-- pg_constraint lookup, matching the pattern in 002_create_communities.sql.
--
-- NOT VALID for the same reason 017_members_integrity.sql uses it: new and
-- updated rows are checked, while any pre-existing row is left alone so the
-- migration cannot fail on legacy data. The table is dormant today, but the
-- migration must not assume that of every environment.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT *
    FROM (VALUES
      -- The recipient is a Stellar ed25519 public key, the same shape members
      -- and communities already enforce.
      ('notifications_stellar_address_format',
       'stellar_address ~ ''^G[A-Z2-7]{55}$'''),
      -- A notification cannot have been read before it was created.
      ('notifications_read_at_check',
       'read_at IS NULL OR read_at >= created_at'),
      -- title is NOT NULL, which still admits the empty string.
      ('notifications_title_check',
       'char_length(btrim(title)) > 0')
    ) AS c(constraint_name, check_expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'notifications'::regclass
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE notifications ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        spec.constraint_name,
        spec.check_expression
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE notifications IS
  'In-app notification addressed to a Stellar address; read_at is NULL until read.';
COMMENT ON COLUMN notifications.stellar_address IS
  'Recipient Stellar ed25519 public key (G…56).';
COMMENT ON COLUMN notifications.community_id IS
  'Originating community; NULL for system-wide notifications. Cascades on community delete.';
COMMENT ON COLUMN notifications.type IS
  'Notification category, constrained by notifications_type_check.';
COMMENT ON COLUMN notifications.metadata IS
  'Action-specific payload (loan id, amount, proposal id, and so on).';
COMMENT ON COLUMN notifications.read_at IS
  'When the recipient read it; NULL means unread.';
