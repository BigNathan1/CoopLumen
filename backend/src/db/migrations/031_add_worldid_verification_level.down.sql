ALTER TABLE worldid_verifications DROP CONSTRAINT IF EXISTS worldid_verifications_level_check;
ALTER TABLE worldid_verifications DROP COLUMN IF EXISTS verification_level;
