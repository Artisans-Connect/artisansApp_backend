ALTER TABLE reviews ADD COLUMN review_type text NOT NULL DEFAULT 'client_to_worker' CHECK (review_type IN ('client_to_worker', 'worker_to_client'));
ALTER TABLE reviews DROP CONSTRAINT reviews_job_id_key;
ALTER TABLE reviews ADD CONSTRAINT reviews_job_id_type_key UNIQUE (job_id, review_type);

ALTER TABLE profiles ADD COLUMN client_rating numeric(3,2) DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN client_total_reviews integer DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_client_rating_from_reviews()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.review_type != 'worker_to_client') OR (TG_OP IN ('INSERT', 'UPDATE') AND NEW.review_type != 'worker_to_client') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT client_id INTO v_client_id
  FROM jobs
  WHERE id = COALESCE(NEW.job_id, OLD.job_id);

  IF v_client_id IS NOT NULL THEN
    UPDATE profiles
    SET client_rating = (
          SELECT ROUND(AVG(rating)::numeric, 2)
          FROM reviews r
          JOIN jobs j ON r.job_id = j.id
          WHERE j.client_id = v_client_id AND r.review_type = 'worker_to_client'
        ),
        client_total_reviews = (
          SELECT COUNT(*)
          FROM reviews r
          JOIN jobs j ON r.job_id = j.id
          WHERE j.client_id = v_client_id AND r.review_type = 'worker_to_client'
        )
    WHERE id = v_client_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_client_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION sync_client_rating_from_reviews();
