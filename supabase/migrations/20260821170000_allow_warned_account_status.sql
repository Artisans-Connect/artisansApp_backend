-- Allow the 'warned' account_status value.
--
-- Background: 20260613143000_admin_account_moderation.sql created account_status
-- with CHECK (account_status IN ('active','suspended')). The admin "warn" action
-- (adminService.warnAccount) writes account_status = 'warned', which violated that
-- constraint, so every warning failed with a check-constraint violation.
--
-- Warnings are advisory: the auth middleware only blocks 'suspended', so a 'warned'
-- account retains full access. This migration only widens the allowed set, so no
-- existing row can violate the new constraint.
--
-- The original constraint was created via an inline column CHECK, so Postgres named
-- it deterministically 'profiles_account_status_check'.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'warned'));
