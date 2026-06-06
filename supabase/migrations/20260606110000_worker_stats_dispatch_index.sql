-- Support worker response-time stats from accepted dispatches.

CREATE INDEX IF NOT EXISTS idx_job_dispatches_worker_accepted_response
  ON job_dispatches (worker_id, responded_at DESC)
  WHERE status = 'accepted' AND responded_at IS NOT NULL;
