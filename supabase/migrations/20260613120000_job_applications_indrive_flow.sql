-- Ensure workers can apply only once per job and clients can update statuses
-- through the backend service role without duplicate application rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_job_worker
  ON job_applications (job_id, worker_id);

CREATE INDEX IF NOT EXISTS idx_job_applications_job_status
  ON job_applications (job_id, status, created_at);
