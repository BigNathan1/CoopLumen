DROP INDEX IF EXISTS communities_name_key;

ALTER TABLE communities ADD CONSTRAINT communities_name_key UNIQUE (name);
