ALTER TABLE members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
  ADD CONSTRAINT members_role_check
    CHECK (role IN ('admin', 'treasurer', 'member', 'observer'));
