-- ============================================================
-- Worker exclusion list for re-dispatched jobs
-- ============================================================
-- When a worker backs out of an assigned job and the client
-- re-searches, the cancelled worker's ID is appended here so
-- the matching engine permanently skips them for this job.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS excluded_worker_ids uuid[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_jobs_excluded_workers
  ON jobs USING GIN (excluded_worker_ids);
