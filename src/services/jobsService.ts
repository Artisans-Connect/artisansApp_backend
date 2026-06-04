import { supabaseAdmin } from "../config/supabase";
import { JOB_MODE, JOB_STATUS, MATCHING } from "../constants/enums";
import { appError } from "../utils/appError";
import { createJobSchema, initialJobStatus } from "../validators/jobs.validator";
import * as matchingService from "./matchingService";
import * as notifyService from "./notifyService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findJobByIdempotencyKey(clientId: string, idempotencyKey: string) {
  const { data: row } = await supabaseAdmin
    .from("job_idempotency_keys")
    .select("job_id")
    .eq("client_id", clientId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (!row?.job_id) return null;

  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", row.job_id).maybeSingle();
  return job;
}

export async function createJob(userId: string, body: unknown, idempotencyKeyHeader?: string) {
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid job payload", "VALIDATION_ERROR");
  }

  const idempotencyKey = idempotencyKeyHeader?.trim();
  if (idempotencyKey) {
    if (!UUID_RE.test(idempotencyKey)) {
      throw appError(400, "Idempotency-Key must be a valid UUID", "VALIDATION_ERROR");
    }
    const existing = await findJobByIdempotencyKey(userId, idempotencyKey);
    if (existing) return existing;
  }

  const input = parsed.data;
  const status = initialJobStatus(input.job_mode);

  const expiresAt =
    input.job_mode === JOB_MODE.ASAP
      ? new Date(Date.now() + MATCHING.JOB_EXPIRES_MINUTES * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .insert({
      client_id: userId,
      category_id: input.category_id,
      title: input.title,
      description: input.description,
      photo_urls: input.photo_urls,
      location_lat: input.location_lat,
      location_lng: input.location_lng,
      address_label: input.address_label,
      status,
      job_mode: input.job_mode,
      budget_type: input.budget_type,
      budget_fixed: input.budget_fixed ?? null,
      budget_min: input.budget_min ?? null,
      budget_max: input.budget_max ?? null,
      scheduled_for: input.scheduled_for ?? null,
      service_type: input.service_type,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_CREATE_FAILED");

  if (idempotencyKey) {
    const { error: keyError } = await supabaseAdmin.from("job_idempotency_keys").insert({
      idempotency_key: idempotencyKey,
      client_id: userId,
      job_id: data.id,
    });
    if (keyError) {
      const raced = await findJobByIdempotencyKey(userId, idempotencyKey);
      if (raced) return raced;
      throw appError(500, keyError.message, "IDEMPOTENCY_STORE_FAILED");
    }
  }

  if (input.job_mode === JOB_MODE.ASAP) {
    void matchingService.findAndDispatch(data.id, 1);
  }

  return data;
}

export async function cancelJob(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Not allowed to cancel this job", "FORBIDDEN");

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.CANCELLED })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_CANCEL_FAILED");

  matchingService.clearDispatchState(jobId);

  if (job.worker_id) {
    await notifyService.notifyJobCancelled(job.worker_id, jobId);
  }

  return data;
}

export async function completeJob(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  const isParticipant = job.client_id === userId || job.worker_id === userId;
  if (!isParticipant) throw appError(403, "Not allowed to complete this job", "FORBIDDEN");

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.COMPLETED })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_COMPLETE_FAILED");

  matchingService.clearDispatchState(jobId);
  await notifyService.notifyJobCompleted(job.client_id);

  return data;
}

export async function getMyJobs(userId: string, statusFilter?: string[]) {
  let query = supabaseAdmin
    .from("jobs")
    .select("id, title, status, worker_id, location_lat, location_lng, job_mode, budget_type, budget_fixed, budget_min, budget_max, address_label, created_at, updated_at, profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .eq("client_id", userId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  return data ?? [];
}

export async function getJobById(userId: string, jobId: string) {
  const { data: job, error } = await supabaseAdmin
    .from("jobs")
    .select("*, profiles!jobs_client_id_fkey(full_name, avatar_url, phone), profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  // Only participants can view a job
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not authorized to view this job", "FORBIDDEN");
  }

  return job;
}
