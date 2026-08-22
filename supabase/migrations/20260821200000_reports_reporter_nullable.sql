-- Migration: allow anonymous / public-web abuse reports
--
-- The public "Report Abuse" web form (Support Hub) lets a visitor who is NOT a
-- logged-in CraftMatch user file a Trust & Safety report. Such a report has no
-- reporter profile to reference, so reporter_id must be nullable.
--
-- This is backward-compatible and non-destructive:
--   * existing rows already have a reporter_id (unchanged),
--   * the authenticated in-app path still always sets reporter_id,
--   * all read paths already treat reporter_id as optional
--     (listAdminReports / getAdminReportDetail / getBlockedAndReportedAccounts
--      all do `reporter_id ? ... : null`; getUserReports filters by it).
--
-- Public reports are attributed via context_metadata.source = 'public_web',
-- which also carries the self-provided reporter name/email and the free-text
-- description of who is being reported (moderators resolve the target manually).

ALTER TABLE public.reports
  ALTER COLUMN reporter_id DROP NOT NULL;

COMMENT ON COLUMN public.reports.reporter_id IS
  'Profile that filed the report. NULL for anonymous public-web ("Report Abuse" form) submissions, which are identified by context_metadata.source = ''public_web''.';
