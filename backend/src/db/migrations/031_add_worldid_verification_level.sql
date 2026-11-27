-- The KYC routes record and report which World ID credential verified an
-- account ('orb' or 'device'), but 029 created worldid_verifications without
-- that column, so every status lookup and verification failed.
ALTER TABLE worldid_verifications ADD COLUMN IF NOT EXISTS verification_level TEXT;

ALTER TABLE worldid_verifications
  DROP CONSTRAINT IF EXISTS worldid_verifications_level_check;
ALTER TABLE worldid_verifications
  ADD CONSTRAINT worldid_verifications_level_check
  CHECK (verification_level IS NULL OR verification_level IN ('orb', 'device'));
