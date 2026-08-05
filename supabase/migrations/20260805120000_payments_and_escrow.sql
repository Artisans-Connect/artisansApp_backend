-- Migration: 20260805120000_payments_and_escrow.sql
-- Create payments, escrow, ledger, and payout tables.

-- 1. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending', -- pending, completed, failed
  reference text UNIQUE NOT NULL,
  paystack_payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS for payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payments"
  ON payments FOR SELECT
  USING (client_id = auth.uid());

-- 2. Job Escrow Balances
CREATE TABLE IF NOT EXISTS job_escrow_balances (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  held_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  released_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  refunded_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'held', -- held, released, refunded, disputed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS for job_escrow_balances
ALTER TABLE job_escrow_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view escrow balance"
  ON job_escrow_balances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_escrow_balances.job_id
        AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
    )
  );

-- 3. Escrow Ledger (immutable log)
CREATE TABLE IF NOT EXISTS escrow_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  type text NOT NULL, -- deposit, payout, refund, cancellation_fee
  reference text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS for escrow_ledger
ALTER TABLE escrow_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view ledger logs"
  ON escrow_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = escrow_ledger.job_id
        AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
    )
  );

-- 4. Worker Payout Details
CREATE TABLE IF NOT EXISTS worker_payout_details (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  network text NOT NULL, -- MTN, Vodafone, AirtelTigo
  account_number text NOT NULL,
  account_name text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS for worker_payout_details
ALTER TABLE worker_payout_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can manage their own payout details"
  ON worker_payout_details FOR ALL
  USING (id = auth.uid());

CREATE POLICY "Clients can view worker payout status"
  ON worker_payout_details FOR SELECT
  USING (true);

-- 5. Auto-update Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_escrow_balances_updated_at BEFORE UPDATE ON job_escrow_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_worker_payout_details_updated_at BEFORE UPDATE ON worker_payout_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
