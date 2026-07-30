-- No-op: 007_create_tokens.down.sql drops the tokens table. Dropping it here
-- as well would break 007's rollback ordering (007 rolls back before 004 in a
-- `db:rollback` run, so the table must still exist for 007's down file to
-- find it).
SELECT 1;
