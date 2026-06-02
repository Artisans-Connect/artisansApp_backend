-- Proximity / offline: idempotency keys and per-worker dispatch log

CREATE TABLE job_idempotency_keys (
  idempotency_key uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, idempotency_key)
);

CREATE TABLE job_dispatches (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round smallint NOT NULL DEFAULT 1,
  radius_km numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, worker_id, round)
);

CREATE INDEX idx_workers_location_fresh
  ON workers (location_at DESC)
  WHERE is_available = true AND current_lat IS NOT NULL;

CREATE INDEX idx_job_dispatches_worker
  ON job_dispatches (worker_id, created_at DESC);

ALTER TABLE job_idempotency_keys ENABLE ROW LEVEL SECURITY;
-- Express service_role only; no client JWT policies

ALTER TABLE job_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers view own dispatches" ON job_dispatches
  FOR SELECT USING (auth.uid() = worker_id);
