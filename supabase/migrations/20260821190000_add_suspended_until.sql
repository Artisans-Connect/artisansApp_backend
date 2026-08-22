-- Add suspended_until to support temporary (auto-expiring) suspensions.
--
-- Background: the moderation flow accepts action_taken = 'TEMPORARY_SUSPENSION'
-- and the API accepts suspend_duration_days, but nothing was ever persisted or
-- read, so a "temporary" suspension behaved identically to a permanent ban — it
-- never lifted. There was no column to record when a suspension should end.
--
-- Semantics (interpreted by the auth middleware, which is the single enforcement
-- point for suspended accounts):
--   account_status = 'suspended' AND suspended_until IS NULL  -> indefinite / permanent
--   account_status = 'suspended' AND suspended_until > now()   -> temporary, still active
--   account_status = 'suspended' AND suspended_until <= now()  -> expired, auto-lifted on next request
--
-- This is purely additive (nullable column, no default backfill needed): every
-- existing suspension has suspended_until = NULL and therefore stays indefinite,
-- exactly matching current behaviour.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

COMMENT ON COLUMN profiles.suspended_until IS
  'When a temporary suspension expires. NULL while suspended means indefinite/permanent. Expired values are auto-lifted on the next authenticated request.';
