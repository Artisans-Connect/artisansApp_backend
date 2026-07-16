ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS distance_km numeric(8,2),
  ADD COLUMN IF NOT EXISTS distance_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS base_service_fee numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS urgency_premium numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_quote numeric(10,2),
  ADD COLUMN IF NOT EXISTS quote_currency text NOT NULL DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS quoted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_applications_quote_job_status
  ON job_applications (job_id, status, total_quote);
