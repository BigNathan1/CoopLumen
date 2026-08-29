DROP INDEX IF EXISTS idx_transactions_log_community_created_desc;
DROP INDEX IF EXISTS idx_members_community_stellar_unique;

DROP TRIGGER IF EXISTS audit_log_updated_at ON audit_log;
DROP TRIGGER IF EXISTS notifications_updated_at ON notifications;
DROP TRIGGER IF EXISTS transactions_log_updated_at ON transactions_log;
DROP TRIGGER IF EXISTS loan_events_updated_at ON loan_events;
DROP TRIGGER IF EXISTS trustlines_updated_at ON trustlines;
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
DROP TRIGGER IF EXISTS members_updated_at ON members;

ALTER TABLE audit_log DROP COLUMN IF EXISTS updated_at;
ALTER TABLE notifications DROP COLUMN IF EXISTS updated_at;
ALTER TABLE transactions_log DROP COLUMN IF EXISTS updated_at;
ALTER TABLE loan_events DROP COLUMN IF EXISTS updated_at;
ALTER TABLE trustlines DROP COLUMN IF EXISTS updated_at;
ALTER TABLE payments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE members DROP COLUMN IF EXISTS updated_at;
