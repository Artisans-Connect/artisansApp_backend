/*
  # App-aligned worker verification schema

  Apply this single migration to the shared Artisans Supabase project.
  It replaces the portal's draft/demo migrations and links verification
  approval to the existing backend `workers.is_verified` flag.
*/

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_users'
      AND policyname = 'Admins can read admin users'
  ) THEN
    CREATE POLICY "Admins can read admin users"
      ON admin_users FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS worker_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  application_number text UNIQUE NOT NULL DEFAULT 'ART-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'more_info_requested')),
  verification_level text NOT NULL DEFAULT 'identity'
    CHECK (verification_level IN ('identity', 'professional', 'premium')),
  full_name text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  date_of_birth date,
  gender text DEFAULT '',
  trade_category text NOT NULL DEFAULT '',
  years_of_experience integer DEFAULT 0,
  business_name text DEFAULT '',
  current_region text DEFAULT '',
  current_city text DEFAULT '',
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  fraud_indicators jsonb DEFAULT '[]'::jsonb,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  rejection_reason text DEFAULT '',
  admin_notes text DEFAULT '',
  more_info_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE worker_verifications ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_verifications_one_active
  ON worker_verifications(worker_id)
  WHERE status IN ('pending', 'under_review', 'more_info_requested', 'approved');

CREATE INDEX IF NOT EXISTS idx_worker_verifications_worker_id ON worker_verifications(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_verifications_status ON worker_verifications(status);
CREATE INDEX IF NOT EXISTS idx_worker_verifications_application_number ON worker_verifications(application_number);
CREATE INDEX IF NOT EXISTS idx_worker_verifications_submitted_at ON worker_verifications(submitted_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_verifications'
      AND policyname = 'Workers can insert own verification'
  ) THEN
    CREATE POLICY "Workers can insert own verification"
      ON worker_verifications FOR INSERT
      TO authenticated
      WITH CHECK (worker_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_verifications'
      AND policyname = 'Workers can read own verification'
  ) THEN
    CREATE POLICY "Workers can read own verification"
      ON worker_verifications FOR SELECT
      TO authenticated
      USING (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'worker_verifications'
      AND policyname = 'Admins can update verifications'
  ) THEN
    CREATE POLICY "Admins can update verifications"
      ON worker_verifications FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES worker_verifications(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN ('id_front', 'id_back', 'selfie', 'certification', 'training', 'portfolio')),
  storage_path text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  file_name text DEFAULT '',
  file_size integer DEFAULT 0,
  mime_type text DEFAULT '',
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_documents_verification_id ON verification_documents(verification_id);
CREATE INDEX IF NOT EXISTS idx_documents_worker_id ON verification_documents(worker_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'verification_documents'
      AND policyname = 'Workers manage own documents'
  ) THEN
    CREATE POLICY "Workers manage own documents"
      ON verification_documents FOR ALL
      TO authenticated
      USING (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      )
      WITH CHECK (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES worker_verifications(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  reference_name text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  relationship text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_references ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_references_verification_id ON verification_references(verification_id);
CREATE INDEX IF NOT EXISTS idx_references_worker_id ON verification_references(worker_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'verification_references'
      AND policyname = 'Workers manage own references'
  ) THEN
    CREATE POLICY "Workers manage own references"
      ON verification_references FOR ALL
      TO authenticated
      USING (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      )
      WITH CHECK (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES worker_verifications(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES workers(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id),
  admin_name text DEFAULT '',
  action text NOT NULL
    CHECK (action IN ('submitted', 'reviewed', 'approved', 'rejected', 'more_info_requested', 'documents_uploaded', 'status_changed')),
  notes text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_verification_id ON verification_audit_logs(verification_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_worker_id ON verification_audit_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON verification_audit_logs(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'verification_audit_logs'
      AND policyname = 'Workers and admins read audit logs'
  ) THEN
    CREATE POLICY "Workers and admins read audit logs"
      ON verification_audit_logs FOR SELECT
      TO authenticated
      USING (
        worker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'verification_audit_logs'
      AND policyname = 'Admins insert audit logs'
  ) THEN
    CREATE POLICY "Admins insert audit logs"
      ON verification_audit_logs FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS verification_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text UNIQUE NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_handoffs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_verification_handoffs_worker_id ON verification_handoffs(worker_id);
CREATE INDEX IF NOT EXISTS idx_verification_handoffs_expires_at ON verification_handoffs(expires_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs',
  'verification-docs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Workers upload own verification docs'
  ) THEN
    CREATE POLICY "Workers upload own verification docs"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'verification-docs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Workers and admins read verification docs'
  ) THEN
    CREATE POLICY "Workers and admins read verification docs"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'verification-docs'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_worker_verified_from_application()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE workers
    SET is_verified = true,
        updated_at = now()
    WHERE id = NEW.worker_id;
  ELSIF OLD.status = 'approved' AND NEW.status IN ('rejected', 'more_info_requested') THEN
    UPDATE workers
    SET is_verified = false,
        updated_at = now()
    WHERE id = NEW.worker_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_worker_verified_from_application ON worker_verifications;
CREATE TRIGGER trg_sync_worker_verified_from_application
AFTER UPDATE OF status ON worker_verifications
FOR EACH ROW
EXECUTE FUNCTION sync_worker_verified_from_application();
