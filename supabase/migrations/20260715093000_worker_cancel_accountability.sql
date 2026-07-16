-- Worker cancellation accountability: 30-day rolling cancel counter,
-- mirroring the existing client_cancel_count / client_cancel_reset_at pair.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS worker_cancel_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worker_cancel_reset_at timestamptz DEFAULT now();
