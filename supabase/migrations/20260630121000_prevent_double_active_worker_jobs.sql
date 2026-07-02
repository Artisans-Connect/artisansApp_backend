CREATE UNIQUE INDEX IF NOT EXISTS one_active_worker_job_per_worker
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
