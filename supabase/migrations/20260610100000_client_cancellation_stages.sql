-- ============================================================
-- Client-side staged cancellation
-- ============================================================

-- 1. Add termination_requested to the job_status enum
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'termination_requested';

-- 2. Add cancellation-stage columns to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS cancellation_stage text
    CHECK (cancellation_stage IS NULL OR cancellation_stage IN (
      'free', 'warning', 'travel_compensation', 'significant_fee', 'termination_requested'
    )),
  ADD COLUMN IF NOT EXISTS cancellation_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_currency text DEFAULT 'GHS';

-- 3. Create job_cancellations ledger table
CREATE TABLE IF NOT EXISTS job_cancellations (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid           NOT NULL REFERENCES jobs(id),
  cancelled_by  text           NOT NULL CHECK (cancelled_by IN ('client', 'worker')),
  cancellation_stage text      NOT NULL,
  job_status_at_cancel text    NOT NULL,
  fee_amount    numeric(10,2)  DEFAULT 0,
  fee_currency  text           DEFAULT 'GHS',
  fee_reason    text,
  worker_distance_km numeric(8,2),
  reason        text,
  created_at    timestamptz    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cancellations_job_id
  ON job_cancellations(job_id);

CREATE INDEX IF NOT EXISTS idx_job_cancellations_cancelled_by
  ON job_cancellations(cancelled_by);

-- RLS
ALTER TABLE job_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access on job_cancellations"
  ON job_cancellations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Add cancellation counter columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS client_cancel_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_cancel_reset_at timestamptz DEFAULT now();
