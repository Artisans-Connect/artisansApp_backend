ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'pending_client_approval';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS completion_dispute_note text;
