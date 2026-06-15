-- Admin account moderation fields. Accounts are never hard-deleted from the
-- admin portal; suspension blocks backend access while preserving history.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'suspended')),
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspension_reason text;

CREATE INDEX IF NOT EXISTS idx_profiles_account_status
  ON profiles(account_status);
