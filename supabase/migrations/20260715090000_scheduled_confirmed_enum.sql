-- Add the scheduled_confirmed job status.
-- Must be its own migration: a new enum value cannot be referenced in the
-- same transaction/migration that adds it.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'scheduled_confirmed';
