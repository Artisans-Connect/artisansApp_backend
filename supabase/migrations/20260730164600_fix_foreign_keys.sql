-- Fix potentially incorrectly mapped foreign keys from the dynamic SQL migration
-- We are explicitly dropping and recreating them with hardcoded table and column names
-- to guarantee they reference the correct tables (public.profiles and auth.users).

-- jobs
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_client_id_fkey;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_worker_id_fkey;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_requested_worker_id_fkey;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_requested_worker_id_fkey FOREIGN KEY (requested_worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- reviews
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_worker_id_fkey;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- messages
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- worker_verifications
ALTER TABLE public.worker_verifications DROP CONSTRAINT IF EXISTS worker_verifications_reviewed_by_fkey;
ALTER TABLE public.worker_verifications ADD CONSTRAINT worker_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- verification_audit_logs
ALTER TABLE public.verification_audit_logs DROP CONSTRAINT IF EXISTS verification_audit_logs_admin_id_fkey;
ALTER TABLE public.verification_audit_logs ADD CONSTRAINT verification_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;
