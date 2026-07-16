-- Recreate the active-job unique index so a confirmed scheduled job does not
-- block the worker from taking other work. 'scheduled_confirmed' is
-- deliberately excluded from the predicate.
DROP INDEX IF EXISTS one_active_worker_job_per_worker;
CREATE UNIQUE INDEX one_active_worker_job_per_worker
  ON jobs (worker_id)
  WHERE worker_id IS NOT NULL
    AND status IN (
      'matched',
      'on_the_way',
      'arrived',
      'in_progress',
      'termination_requested',
      'pending_client_approval'
    );

-- Reminder dedup stamps for the scheduled-job reminder crons, and the worker
-- travel origin captured at the on_the_way transition (used for travel
-- cancellation compensation based on distance actually travelled).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS worker_origin_lat double precision,
  ADD COLUMN IF NOT EXISTS worker_origin_lng double precision;
