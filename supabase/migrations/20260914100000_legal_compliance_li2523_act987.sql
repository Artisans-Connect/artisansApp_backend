-- Migration: 20260914100000_legal_compliance_li2523_act987.sql
-- Description:
-- 1. National Identity Register Regulations L.I. 2523: Add ghana_card_pin column to worker_verifications.
-- 2. Data Protection Act (Act 843) & Act 987: Restrict worker_payout_details SELECT RLS policy to workers and admins only,
--    removing the overly permissive public/client access policy that exposed sensitive MoMo account numbers.

-- 1. Add ghana_card_pin to worker_verifications
ALTER TABLE worker_verifications 
  ADD COLUMN IF NOT EXISTS ghana_card_pin text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_verifications_ghana_card_pin 
  ON worker_verifications(ghana_card_pin) 
  WHERE ghana_card_pin IS NOT NULL;

-- 2. Restrict worker_payout_details RLS
DO $$
BEGIN
  -- Drop overly permissive policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'worker_payout_details' 
      AND policyname = 'Clients can view worker payout status'
  ) THEN
    DROP POLICY "Clients can view worker payout status" ON worker_payout_details;
  END IF;

  -- Create restricted policy: worker themselves or authenticated portal admins only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'worker_payout_details' 
      AND policyname = 'Workers and admins can select payout details'
  ) THEN
    CREATE POLICY "Workers and admins can select payout details"
      ON worker_payout_details FOR SELECT
      TO authenticated
      USING (
        id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;
END $$;
