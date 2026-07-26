-- #031: keep the on-chain audit trail durable across community deletion.
--
-- Migration 008 created transactions_log.community_id with an inline
-- REFERENCES communities(id) clause, which defaults to ON DELETE NO ACTION.
-- That blocks deleting a community once any transaction has been logged for it,
-- and — worse for an audit trail — it couples the retention of immutable audit
-- records to the lifetime of the community. Re-create the FK as ON DELETE SET
-- NULL so the log row survives (community_id nulled) when a community is removed.
--
-- Dropping and re-adding the constraint by its default name is idempotent: the
-- DROP is guarded with IF EXISTS, so re-running this statement is safe.
ALTER TABLE transactions_log
  DROP CONSTRAINT IF EXISTS transactions_log_community_id_fkey;

ALTER TABLE transactions_log
  ADD CONSTRAINT transactions_log_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL;
