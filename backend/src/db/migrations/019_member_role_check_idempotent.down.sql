-- Nothing to undo. 019 re-established members_role_check with the same
-- definition 011_create_member_roles.sql already gave it, so the schema after
-- 019 is identical to the schema before it.
--
-- Dropping the constraint here would roll back 011, which this migration does
-- not own. The SELECT keeps the file a valid runnable statement for the
-- rollback runner.
SELECT 1;
