import crypto from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

const HANDOFF_TTL_MS = 5 * 60 * 1000;

const applicationSchema = z.object({
  handoff_code: z.string().min(16).optional(),
  verification_level: z.enum(["identity", "professional", "premium"]).default("identity"),
  full_name: z.string().trim().min(1),
  phone_number: z.string().trim().min(1),
  email: z.string().trim().email(),
  date_of_birth: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().default(""),
  trade_category: z.string().trim().min(1),
  years_of_experience: z.coerce.number().int().min(0).max(60).default(0),
  business_name: z.string().trim().optional().default(""),
  current_region: z.string().trim().optional().default(""),
  current_city: z.string().trim().optional().default(""),
  confidence_score: z.coerce.number().int().min(0).max(100).default(0),
  fraud_indicators: z.array(z.string()).default([]),
  references: z
    .array(
      z.object({
        reference_name: z.string().trim().min(1),
        phone_number: z.string().trim().min(1),
        relationship: z.string().trim().min(1),
      }),
    )
    .default([]),
});

const statusSchema = z.object({
  status: z.enum(["under_review", "approved", "rejected", "more_info_requested"]),
  verification_level: z.enum(["identity", "professional", "premium"]).optional(),
  rejection_reason: z.string().trim().optional().default(""),
  admin_notes: z.string().trim().optional().default(""),
  more_info_message: z.string().trim().optional().default(""),
});

type VerificationStatus = z.infer<typeof statusSchema>["status"];

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function ensureWorker(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "WORKER_FETCH_FAILED");
  if (!data) throw appError(403, "Worker profile required", "WORKER_PROFILE_REQUIRED");
}

async function readWorkerContext(workerId: string) {
  const [{ data: profile }, { data: worker }, { data: verification }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", workerId).maybeSingle(),
    supabaseAdmin.from("workers").select("*").eq("id", workerId).maybeSingle(),
    supabaseAdmin
      .from("worker_verifications")
      .select("*")
      .eq("worker_id", workerId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    profile,
    worker,
    verification,
  };
}

async function workerIdFromHandoff(code: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("verification_handoffs")
    .select("id, worker_id, expires_at, consumed_at")
    .eq("code_hash", hashCode(code))
    .maybeSingle();

  if (error) throw appError(500, error.message, "HANDOFF_FETCH_FAILED");
  if (!data) throw appError(401, "Invalid verification handoff", "HANDOFF_INVALID");
  if (data.consumed_at) throw appError(401, "Verification handoff already used", "HANDOFF_USED");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw appError(401, "Verification handoff expired", "HANDOFF_EXPIRED");
  }

  return data.worker_id;
}

export async function createHandoff(userId: string) {
  await ensureWorker(userId);

  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("verification_handoffs").insert({
    code_hash: hashCode(code),
    worker_id: userId,
    expires_at: expiresAt,
  });

  if (error) throw appError(500, error.message, "HANDOFF_CREATE_FAILED");
  return { handoff_code: code, expires_at: expiresAt };
}

export async function exchangeHandoff(body: unknown) {
  const parsed = z.object({ handoff_code: z.string().min(16) }).safeParse(body);
  if (!parsed.success) {
    throw appError(400, "Invalid verification handoff", "VALIDATION_ERROR");
  }

  const workerId = await workerIdFromHandoff(parsed.data.handoff_code);
  return readWorkerContext(workerId);
}

export async function getMine(userId: string) {
  await ensureWorker(userId);
  return readWorkerContext(userId);
}

export async function submitApplication(userId: string | null, body: unknown) {
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid application", "VALIDATION_ERROR");
  }

  const input = parsed.data;
  const workerId = userId ?? (input.handoff_code ? await workerIdFromHandoff(input.handoff_code) : null);
  if (!workerId) throw appError(401, "Sign in or open verification from the app", "UNAUTHORIZED");

  await ensureWorker(workerId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("worker_verifications")
    .select("id, status")
    .eq("worker_id", workerId)
    .in("status", ["pending", "under_review", "more_info_requested", "approved"])
    .maybeSingle();

  if (existingError) throw appError(500, existingError.message, "VERIFICATION_FETCH_FAILED");
  if (existing && existing.status !== "more_info_requested") {
    throw appError(409, "You already have an active verification application", "VERIFICATION_EXISTS");
  }

  const verificationPatch = {
    worker_id: workerId,
    status: "pending" as VerificationStatus,
    verification_level: input.verification_level,
    full_name: input.full_name,
    phone_number: input.phone_number,
    email: input.email,
    date_of_birth: input.date_of_birth || null,
    gender: input.gender,
    trade_category: input.trade_category,
    years_of_experience: input.years_of_experience,
    business_name: input.business_name,
    current_region: input.current_region,
    current_city: input.current_city,
    confidence_score: input.confidence_score,
    fraud_indicators: input.fraud_indicators,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const query = existing
    ? supabaseAdmin.from("worker_verifications").update(verificationPatch).eq("id", existing.id).select().single()
    : supabaseAdmin.from("worker_verifications").insert(verificationPatch).select().single();

  const { data: verification, error } = await query;
  if (error) throw appError(500, error.message, "VERIFICATION_SUBMIT_FAILED");

  if (input.references.length > 0) {
    await supabaseAdmin.from("verification_references").delete().eq("verification_id", verification.id);
    const { error: referencesError } = await supabaseAdmin.from("verification_references").insert(
      input.references.map((reference) => ({
        ...reference,
        worker_id: workerId,
        verification_id: verification.id,
      })),
    );
    if (referencesError) throw appError(500, referencesError.message, "REFERENCES_SAVE_FAILED");
  }

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verification.id,
    worker_id: workerId,
    action: "submitted",
    notes: "Application submitted by worker",
  });

  if (input.handoff_code) {
    await supabaseAdmin
      .from("verification_handoffs")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code_hash", hashCode(input.handoff_code));
  }

  return verification;
}

export async function setApplicationStatus(adminUserId: string, verificationId: string, body: unknown) {
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid verification status", "VALIDATION_ERROR");
  }

  const { data: admin } = await supabaseAdmin
    .from("admin_users")
    .select("full_name")
    .eq("user_id", adminUserId)
    .maybeSingle();
  if (!admin) throw appError(403, "Verification admin access required", "FORBIDDEN");

  const input = parsed.data;
  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.verification_level) patch.verification_level = input.verification_level;
  if (input.rejection_reason) patch.rejection_reason = input.rejection_reason;
  if (input.admin_notes) patch.admin_notes = input.admin_notes;
  if (input.more_info_message) patch.more_info_message = input.more_info_message;

  const { data, error } = await supabaseAdmin
    .from("worker_verifications")
    .update(patch)
    .eq("id", verificationId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "VERIFICATION_STATUS_FAILED");

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verificationId,
    worker_id: data.worker_id,
    admin_id: adminUserId,
    admin_name: admin.full_name,
    action: input.status === "under_review" ? "reviewed" : input.status,
    notes: input.rejection_reason || input.more_info_message || input.admin_notes || `Application ${input.status}`,
  });

  return data;
}
