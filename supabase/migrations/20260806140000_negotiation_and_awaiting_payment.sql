-- Migration: 20260806140000_negotiation_and_awaiting_payment.sql
-- Add 'awaiting_payment' to job_status enum and negotiation fields to job_applications

-- 1. Add awaiting_payment to job_status enum
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'awaiting_payment';

-- 2. Add bargaining columns to job_applications table
ALTER TABLE job_applications 
  ADD COLUMN IF NOT EXISTS last_proposed_by text CHECK (last_proposed_by IN ('worker', 'client')) DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS counter_rate numeric(10,2);
