-- Worker cancellation metadata used by live tracking and replacement matching.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_cancelled_by_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('client', 'worker'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_client_cancelled_by
  ON jobs (client_id, status, cancelled_by)
  WHERE status = 'cancelled';
