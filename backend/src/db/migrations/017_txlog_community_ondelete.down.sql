-- Revert transactions_log.community_id to the original ON DELETE NO ACTION FK.
ALTER TABLE transactions_log
  DROP CONSTRAINT IF EXISTS transactions_log_community_id_fkey;

ALTER TABLE transactions_log
  ADD CONSTRAINT transactions_log_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES communities(id);
