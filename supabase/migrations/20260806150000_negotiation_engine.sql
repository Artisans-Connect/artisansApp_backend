-- Migration: 20260806150000_negotiation_engine.sql
-- Create negotiations and negotiation_rounds tables for a unified bargaining flow.

CREATE TABLE IF NOT EXISTS negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  application_id uuid REFERENCES job_applications(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('quote', 'extra_charge', 'completion_adjustment')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'expired', 'paid')),
  initial_amount numeric(10,2) NOT NULL,
  agreed_amount numeric(10,2),
  initiated_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  idempotency_key text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS negotiation_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id uuid REFERENCES negotiations(id) ON DELETE CASCADE NOT NULL,
  round_number int NOT NULL,
  proposed_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  proposed_amount numeric(10,2) NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(negotiation_id, round_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_negotiations_job ON negotiations(job_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_status ON negotiations(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_rounds_negotiation ON negotiation_rounds(negotiation_id);

-- Enable Row Level Security (RLS)
ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_rounds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their negotiations"
  ON negotiations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = negotiations.job_id
        AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid() OR jobs.status IN ('searching', 'matching'))
    )
  );

CREATE POLICY "Users can view and insert rounds for their negotiations"
  ON negotiation_rounds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM negotiations n
      JOIN jobs j ON j.id = n.job_id
      WHERE n.id = negotiation_rounds.negotiation_id
        AND (j.client_id = auth.uid() OR j.worker_id = auth.uid() OR j.status IN ('searching', 'matching'))
    )
  );

-- Auto-update Trigger for updated_at
CREATE TRIGGER update_negotiations_updated_at 
  BEFORE UPDATE ON negotiations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add tables to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE negotiations;
ALTER PUBLICATION supabase_realtime ADD TABLE negotiation_rounds;

-- Create checkout_sessions table for portal payment redirection
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  negotiation_id uuid REFERENCES negotiations(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10,2) NOT NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view a checkout session by ID"
  ON checkout_sessions FOR SELECT
  USING (true); -- Publicly viewable for checkout landing pages

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE checkout_sessions;

