-- Add started_at column to jobs table to track work start times
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
