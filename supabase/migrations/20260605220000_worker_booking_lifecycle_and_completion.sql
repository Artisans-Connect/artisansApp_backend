-- Worker booking lifecycle states and completion evidence.

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'on_the_way';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'arrived';

CREATE TABLE IF NOT EXISTS job_completion_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hours_spent numeric(6,2),
  materials_used text,
  notes text,
  photo_urls text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_completion_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'job_completion_details'
      AND policyname = 'Participants can view completion details'
  ) THEN
    CREATE POLICY "Participants can view completion details"
      ON job_completion_details FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM jobs
          WHERE jobs.id = job_completion_details.job_id
            AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
        )
      );
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('completion-photos', 'completion-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users upload own completion photos'
  ) THEN
    CREATE POLICY "Authenticated users upload own completion photos"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'completion-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read completion photos'
  ) THEN
    CREATE POLICY "Public read completion photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'completion-photos');
  END IF;
END $$;
