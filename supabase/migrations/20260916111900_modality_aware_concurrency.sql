-- Drop the old constraint that blocked all job types
DROP INDEX IF EXISTS one_active_worker_job_per_worker;

-- Create the new constraint that only blocks exclusive travel-based job types
CREATE UNIQUE INDEX one_exclusive_worker_job_per_worker
  ON jobs (worker_id)
  WHERE worker_id IS NOT NULL
    AND service_type IN ('home_visit', 'pickup_delivery')
    AND status IN (
      'matched',
      'on_the_way',
      'arrived',
      'in_progress',
      'termination_requested',
      'pending_client_approval'
    );
