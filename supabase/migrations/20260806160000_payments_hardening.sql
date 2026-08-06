-- Migration: payments hardening (Idempotency and Auditing tables)
-- Created At: 2026-08-06T16:42:00Z

CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE payment_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can select idempotency keys" ON payment_idempotency_keys 
  FOR SELECT USING (true);

CREATE POLICY "Admins can select payment audit logs" ON payment_audit_logs 
  FOR SELECT USING (true);
