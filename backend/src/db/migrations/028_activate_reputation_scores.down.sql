-- Activation only seeds missing read-model rows. Preserve those records and
-- the schema on rollback because they may have received live updates.
COMMENT ON TABLE reputation_scores IS
  'Per-address, per-community lending reputation score.';
