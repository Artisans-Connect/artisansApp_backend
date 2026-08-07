-- Migration: 20260806130000_extra_charges.sql
-- Create job_extra_charges table to support worker-proposed extra charges and client counter-offers.

CREATE TABLE IF NOT EXISTS job_extra_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  requested_amount numeric(10,2) NOT NULL,
  proposed_by text NOT NULL CHECK (proposed_by IN ('worker', 'client')),
  status text NOT NULL DEFAULT 'pending', -- pending, countered, accepted, paid, rejected
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS for job_extra_charges
ALTER TABLE job_extra_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can manage extra charges"
  ON job_extra_charges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_extra_charges.job_id
        AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
    )
  );

-- Auto-update Trigger for updated_at
CREATE TRIGGER update_job_extra_charges_updated_at 
  BEFORE UPDATE ON job_extra_charges 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add table to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE job_extra_charges;
