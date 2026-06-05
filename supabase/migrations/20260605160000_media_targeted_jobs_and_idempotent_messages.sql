-- App media storage, targeted job requests, and idempotent chat sends.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos', 'job-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('chat-media', 'chat-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
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
      AND policyname = 'Authenticated users upload own job photos'
  ) THEN
    CREATE POLICY "Authenticated users upload own job photos"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'job-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users upload own chat media'
  ) THEN
    CREATE POLICY "Authenticated users upload own chat media"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'chat-media'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read app media'
  ) THEN
    CREATE POLICY "Public read app media"
      ON storage.objects FOR SELECT
      USING (bucket_id IN ('job-photos', 'chat-media'));
  END IF;
END $$;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS requested_worker_id uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_jobs_requested_worker_id
  ON jobs (requested_worker_id, created_at DESC)
  WHERE requested_worker_id IS NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid,
  ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS media_types text[] DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_client_message_id
  ON messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
