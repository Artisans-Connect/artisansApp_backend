-- Migration: Add GhanaPost digital address and progressive tiered verification attributes
-- Timestamp: 20260915000000

-- 1. Add digital address and location verification columns to worker_verifications
ALTER TABLE worker_verifications
  ADD COLUMN IF NOT EXISTS digital_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS gps_region text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gps_district text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_tier text DEFAULT 'identity';

-- 2. Add digital address and tiered verification columns to workers table
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS digital_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS verification_level text DEFAULT 'identity',
  ADD COLUMN IF NOT EXISTS verified_badges jsonb DEFAULT '[]'::jsonb;

-- 3. Create index on digital_address for fast lookup
CREATE INDEX IF NOT EXISTS idx_worker_verifications_digital_address ON worker_verifications(digital_address);
CREATE INDEX IF NOT EXISTS idx_workers_verification_level ON workers(verification_level);

-- 4. Update sync function so when a worker verification is approved,
-- the verification_level and verified_badges sync to the workers table.
CREATE OR REPLACE FUNCTION sync_worker_verified_from_application()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE workers
    SET is_verified = true,
        verification_level = COALESCE(NEW.verification_level, 'identity'),
        digital_address = COALESCE(NEW.digital_address, ''),
        gps_lat = NEW.gps_lat,
        gps_lng = NEW.gps_lng,
        updated_at = now()
    WHERE id = NEW.worker_id;
  ELSIF OLD.status = 'approved' AND NEW.status IN ('rejected', 'more_info_requested') THEN
    UPDATE workers
    SET is_verified = false,
        updated_at = now()
    WHERE id = NEW.worker_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
