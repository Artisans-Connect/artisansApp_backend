import { z } from "zod";

export const REPORT_CATEGORIES = [
  "UNFAIR_TREATMENT",
  "HARASSMENT",
  "SCAM_FRAUD",
  "FAKE_IDENTITY",
  "PAYMENT_OUTSIDE_APP",
  "POOR_WORKMANSHIP",
  "SAFETY_CONCERN",
  "VIOLENCE_THREAT",
  "PROPERTY_DAMAGE",
  "NO_SHOW",
  "UNPROFESSIONAL_BEHAVIOR",
  "OTHER",
] as const;

export const REPORT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const REPORT_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "NEEDS_EVIDENCE",
  "ACTION_TAKEN",
  "DISMISSED",
  "RESOLVED",
] as const;
export const MODERATION_ACTIONS = [
  "NONE",
  "WARNING_ISSUED",
  "TEMPORARY_SUSPENSION",
  "PERMANENT_BAN",
  "DISMISSED",
  "EVIDENCE_REQUESTED",
] as const;

export const createReportSchema = z.object({
  reported_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  chat_id: z.string().uuid().optional().nullable(),
  category: z.enum(REPORT_CATEGORIES),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(2000, "Description cannot exceed 2000 characters"),
  attachments: z.array(z.string().url()).optional().default([]),
  is_emergency: z.boolean().optional().default(false),
  client_metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateReportModerationSchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  priority: z.enum(REPORT_PRIORITIES).optional(),
  action_taken: z.enum(MODERATION_ACTIONS).optional(),
  assigned_moderator_id: z.string().uuid().optional().nullable(),
  moderation_notes: z.string().trim().optional().nullable(),
  resolution_reason: z.string().trim().optional().nullable(),
  suspend_duration_days: z.number().int().positive().optional().nullable(),
});

export const blockUserSchema = z.object({
  blocked_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

// Public "Report Abuse" web form (Support Hub). The submitter is NOT a
// logged-in user, so we capture their self-provided identity and a free-text
// description of who they're reporting instead of profile UUIDs.
export const PUBLIC_REPORT_REASONS = [
  "scam",
  "harassment",
  "no_show",
  "property_damage",
  "other",
] as const;

export const createPublicReportSchema = z.object({
  reporter_name: z.string().trim().min(2, "Please provide your name").max(120),
  reporter_email: z.string().trim().toLowerCase().email("A valid email address is required").max(200),
  reported_target: z
    .string()
    .trim()
    .min(2, "Please tell us who you are reporting (name or phone)")
    .max(200),
  reason: z.enum(PUBLIC_REPORT_REASONS).optional().default("other"),
  details: z
    .string()
    .trim()
    .min(10, "Please describe the incident (at least 10 characters)")
    .max(1500, "Details cannot exceed 1500 characters"),
});
