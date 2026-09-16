-- Migration: Create business_inquiries table and add GNHR / Workshop fields to verification
-- Timestamp: 20260915020000

-- 1. Create business_inquiries table for Enterprise / Property Management leads
CREATE TABLE IF NOT EXISTS business_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text DEFAULT '',
  business_type text DEFAULT 'Property Management',
  units_count text DEFAULT '',
  message text DEFAULT '',
  status text DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'CONVERTED', 'CLOSED')),
  notes text DEFAULT '',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_inquiries_status ON business_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_business_inquiries_created_at ON business_inquiries(created_at DESC);

-- Enable RLS
ALTER TABLE business_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public inquiries from the website)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_inquiries' AND policyname = 'Allow public insert on business_inquiries'
  ) THEN
    CREATE POLICY "Allow public insert on business_inquiries"
      ON business_inquiries FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Allow authenticated admins full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'business_inquiries' AND policyname = 'Allow admin full access on business_inquiries'
  ) THEN
    CREATE POLICY "Allow admin full access on business_inquiries"
      ON business_inquiries FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'support')
        )
      );
  END IF;
END $$;

-- 2. Add GNHR and Workshop location columns to worker_verifications
ALTER TABLE worker_verifications
  ADD COLUMN IF NOT EXISTS gnhr_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gnhr_member_uuid text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gnhr_data jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gnhr_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS gnhr_match_status text DEFAULT 'UNCHECKED',
  ADD COLUMN IF NOT EXISTS gnhr_region_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gnhr_district_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS workshop_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS workshop_digital_address text DEFAULT '';

-- 3. Add workshop columns to workers table
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS workshop_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS workshop_digital_address text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_worker_verifications_gnhr_verified ON worker_verifications(gnhr_verified);
CREATE INDEX IF NOT EXISTS idx_worker_verifications_gnhr_match_status ON worker_verifications(gnhr_match_status);
