-- Add settlement columns to job_completion_details
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS base_rate numeric(10,2) DEFAULT 0.00;
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS distance_cost numeric(10,2) DEFAULT 0.00;
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS urgency_premium numeric(10,2) DEFAULT 0.00;
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2) DEFAULT 0.00;
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) DEFAULT 0.00;
ALTER TABLE job_completion_details ADD COLUMN IF NOT EXISTS artisan_payout numeric(10,2) DEFAULT 0.00;

-- Trigger to sync worker rating from reviews
CREATE OR REPLACE FUNCTION sync_worker_rating_from_reviews()
RETURNS trigger AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_worker_id := OLD.worker_id;
  ELSE
    v_worker_id := NEW.worker_id;
  END IF;

  UPDATE workers
  SET rating = COALESCE(
    (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE worker_id = v_worker_id),
    0.00
  )
  WHERE id = v_worker_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_worker_rating_from_reviews ON reviews;
CREATE TRIGGER trg_sync_worker_rating_from_reviews
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION sync_worker_rating_from_reviews();

-- Trigger to sync worker completed jobs count
CREATE OR REPLACE FUNCTION sync_worker_completed_jobs_count()
RETURNS trigger AS $$
BEGIN
  -- Increment on job completed
  IF (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE workers
      SET total_jobs = COALESCE(total_jobs, 0) + 1
      WHERE id = NEW.worker_id;
    END IF;
  -- Decrement if job changes status away from completed
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status != 'completed') THEN
    IF OLD.worker_id IS NOT NULL THEN
      UPDATE workers
      SET total_jobs = GREATEST(0, COALESCE(total_jobs, 0) - 1)
      WHERE id = OLD.worker_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_worker_completed_jobs_count ON jobs;
CREATE TRIGGER trg_sync_worker_completed_jobs_count
AFTER UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION sync_worker_completed_jobs_count();
