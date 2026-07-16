-- Work-progress check-ins and settlement clock stop.
-- work_ended_at: stamped when either party confirms the work is finished (or
-- when the worker submits completion). Settlement hours use this instead of
-- raw wall-clock time at submission.
-- last_progress_checkin_at: dedup stamp for the check-in cron.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS work_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_checkin_at timestamptz;
