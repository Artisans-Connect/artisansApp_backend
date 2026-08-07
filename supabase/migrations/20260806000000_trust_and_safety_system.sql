-- Migration: Trust & Safety System (Reports, Audit Logs, User Blocks)

-- 1. Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  chat_id uuid,
  category text NOT NULL,
  description text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'NEEDS_EVIDENCE', 'ACTION_TAKEN', 'DISMISSED', 'RESOLVED')),
  is_emergency boolean NOT NULL DEFAULT false,
  context_metadata jsonb DEFAULT '{}'::jsonb,
  assigned_moderator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderation_notes text,
  resolution_reason text,
  action_taken text DEFAULT 'NONE' CHECK (action_taken IN ('NONE', 'WARNING_ISSUED', 'TEMPORARY_SUSPENSION', 'PERMANENT_BAN', 'DISMISSED', 'EVIDENCE_REQUESTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_booking_id ON public.reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON public.reports(priority);
CREATE INDEX IF NOT EXISTS idx_reports_is_emergency ON public.reports(is_emergency) WHERE is_emergency = true;
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

-- 2. Report Audit Logs Table
CREATE TABLE IF NOT EXISTS public.report_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT 'moderator',
  action text NOT NULL,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_logs_report_id ON public.report_audit_logs(report_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_logs_created_at ON public.report_audit_logs(created_at DESC);

-- 3. User Blocks Table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_block UNIQUE (blocker_id, blocked_id),
  CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON public.user_blocks(blocked_id);

-- 4. Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Reporters can view their own reports
CREATE POLICY "Users can view own submitted reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Reporters can insert their own reports
CREATE POLICY "Users can insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Users can manage their own blocks
CREATE POLICY "Users can view their blocks"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can insert blocks"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete their blocks"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- Storage Bucket for Report Evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-evidence', 'report-evidence', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Report evidence uploaded by authenticated users"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'report-evidence' AND auth.role() = 'authenticated');

CREATE POLICY "Report evidence readable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'report-evidence');
