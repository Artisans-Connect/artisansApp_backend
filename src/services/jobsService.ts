import { supabaseAdmin } from "../config/supabase";
import { JOB_MODE, JOB_STATUS, MATCHING, CANCELLATION_STAGE, CANCELLATION_FEES } from "../constants/enums";
import { appError } from "../utils/appError";
import { haversineKm } from "../utils/haversine";
import { completeJobSchema, createJobSchema } from "../validators/jobs.validator";
import {
  buildReopenAfterWorkerCancelPatch,
  WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES,
  isRecoverableServiceInterruption,
  isWorkerActiveJobConstraintError,
  shouldDispatchJobOnCreate,
  statusForNewJob,
} from "./jobLifecycle";
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

async function resolveCategoryId(categoryIdOrSlug: string) {
  const isUuid = UUID_RE.test(categoryIdOrSlug);
  const query = supabaseAdmin.from("categories").select("id").eq("is_active", true);
  const { data, error } = await (isUuid
    ? query.eq("id", categoryIdOrSlug)
    : query.eq("slug", categoryIdOrSlug)
  ).maybeSingle();

  if (error) throw appError(500, error.message, "CATEGORY_LOOKUP_FAILED");
  if (!data?.id) {
    throw appError(400, "Selected service category is not available yet", "CATEGORY_NOT_AVAILABLE");
  }
  return data.id as string;
}

async function ensureRequestedWorkerCanReceiveImmediateRequest(workerId: string) {
  const { count, error } = await supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", workerId)
    .in("status", [...WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES]);

  if (error) throw appError(500, error.message, "ACTIVE_JOB_CHECK_FAILED");
  if ((count ?? 0) > 0) {
    throw appError(409, "This worker is currently busy with another job", "WORKER_HAS_ACTIVE_JOB");
  }
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
  const categoryId = await resolveCategoryId(input.category_id);
  const shouldDispatch = shouldDispatchJobOnCreate(input.job_mode, Boolean(input.requested_worker_id));
  const status = input.requested_worker_id && shouldDispatch
    ? JOB_STATUS.MATCHING
    : statusForNewJob(input.job_mode);

  if (input.requested_worker_id && shouldDispatch) {
    await ensureRequestedWorkerCanReceiveImmediateRequest(input.requested_worker_id);
  }

  const expiresAt =
    input.job_mode === JOB_MODE.ASAP
      ? new Date(Date.now() + MATCHING.JOB_EXPIRES_MINUTES * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .insert({
      client_id: userId,
      category_id: categoryId,
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
      requested_worker_id: input.requested_worker_id ?? null,
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

  if (input.requested_worker_id && shouldDispatch) {
    await matchingService.dispatchToWorker(data.id, input.requested_worker_id);
    await notifyService.notifyWorkerNewJob(input.requested_worker_id, {
      id: data.id,
      title: data.title,
      address_label: data.address_label,
    });
  } else if (shouldDispatch) {
    void matchingService.findAndDispatch(data.id, 1);
  }

  return data;
}

/* ── Cancellation helpers ──────────────────────────────────── */

function determineCancellationStage(jobStatus: string, jobUpdatedAt: string | null) {
  switch (jobStatus) {
    case JOB_STATUS.DRAFT:
    case JOB_STATUS.SEARCHING:
    case JOB_STATUS.MATCHING:
      return { stage: CANCELLATION_STAGE.FREE, canCancel: true };
    case JOB_STATUS.MATCHED: {
      // Grace period: if job was matched less than 2 minutes ago, it's free
      if (jobUpdatedAt) {
        const elapsed = Date.now() - new Date(jobUpdatedAt).getTime();
        if (elapsed < CANCELLATION_FEES.GRACE_PERIOD_MS) {
          return { stage: CANCELLATION_STAGE.FREE, canCancel: true };
        }
      }
      return { stage: CANCELLATION_STAGE.WARNING, canCancel: true };
    }
    case JOB_STATUS.ON_THE_WAY:
      return { stage: CANCELLATION_STAGE.TRAVEL_COMPENSATION, canCancel: true };
    case JOB_STATUS.ARRIVED:
      return { stage: CANCELLATION_STAGE.SIGNIFICANT_FEE, canCancel: true };
    case JOB_STATUS.IN_PROGRESS:
    case JOB_STATUS.TERMINATION_REQUESTED:
      return { stage: CANCELLATION_STAGE.TERMINATION_REQUESTED, canCancel: false };
    default:
      return { stage: null, canCancel: false };
  }
}

async function getWorkerLocation(workerId: string) {
  const { data } = await supabaseAdmin
    .from("workers")
    .select("current_lat, current_lng")
    .eq("id", workerId)
    .maybeSingle();
  return data;
}

async function getCategoryBaseFee(categoryId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("categories")
    .select("base_fee")
    .eq("id", categoryId)
    .maybeSingle();
  return data?.base_fee ? Number(data.base_fee) : 80;
}

async function computeCancellationFee(
  job: any,
  stage: string,
): Promise<{ amount: number; reason: string; distanceKm?: number }> {
  if (stage === CANCELLATION_STAGE.FREE || stage === CANCELLATION_STAGE.WARNING) {
    return {
      amount: 0,
      reason: stage === CANCELLATION_STAGE.WARNING ? "Warning issued — no charge" : "Free cancellation",
    };
  }

  if (stage === CANCELLATION_STAGE.TRAVEL_COMPENSATION && job.worker_id) {
    const worker = await getWorkerLocation(job.worker_id);
    if (worker?.current_lat != null && worker?.current_lng != null && job.location_lat != null && job.location_lng != null) {
      const distanceKm = haversineKm(
        Number(worker.current_lat),
        Number(worker.current_lng),
        Number(job.location_lat),
        Number(job.location_lng),
      );
      const fee = Math.round(distanceKm * CANCELLATION_FEES.TRAVEL_RATE_PER_KM);
      return {
        amount: Math.max(fee, 0),
        reason: `Travel compensation: ${distanceKm.toFixed(1)} km × GH₵ ${CANCELLATION_FEES.TRAVEL_RATE_PER_KM}/km`,
        distanceKm,
      };
    }
    return { amount: 0, reason: "Travel compensation (distance unavailable)" };
  }

  if (stage === CANCELLATION_STAGE.SIGNIFICANT_FEE) {
    const baseFee = await getCategoryBaseFee(job.category_id);
    const fee = Math.round(baseFee * CANCELLATION_FEES.ARRIVED_FEE_PERCENT);
    const clampedFee = Math.min(
      Math.max(fee, CANCELLATION_FEES.ARRIVED_FEE_MINIMUM),
      CANCELLATION_FEES.ARRIVED_FEE_MAXIMUM,
    );
    return {
      amount: clampedFee,
      reason: `Cancellation fee: ${Math.round(CANCELLATION_FEES.ARRIVED_FEE_PERCENT * 100)}% of GH₵ ${baseFee} base fee`,
    };
  }

  return { amount: 0, reason: "No fee" };
}

async function recordCancellation(
  jobId: string,
  cancelledBy: string,
  stage: string,
  statusAtCancel: string,
  feeAmount: number,
  feeReason: string,
  reason?: string,
  distanceKm?: number,
) {
  await supabaseAdmin.from("job_cancellations").insert({
    job_id: jobId,
    cancelled_by: cancelledBy,
    cancellation_stage: stage,
    job_status_at_cancel: statusAtCancel,
    fee_amount: feeAmount,
    fee_reason: feeReason,
    worker_distance_km: distanceKm ?? null,
    reason: reason || null,
  });
}

async function incrementClientCancelCount(clientId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("client_cancel_count, client_cancel_reset_at")
    .eq("id", clientId)
    .maybeSingle();

  const resetAt = profile?.client_cancel_reset_at ? new Date(profile.client_cancel_reset_at) : null;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (!resetAt || resetAt < thirtyDaysAgo) {
    await supabaseAdmin
      .from("profiles")
      .update({ client_cancel_count: 1, client_cancel_reset_at: new Date().toISOString() })
      .eq("id", clientId);
  } else {
    const newCount = (profile?.client_cancel_count ?? 0) + 1;
    await supabaseAdmin
      .from("profiles")
      .update({ client_cancel_count: newCount })
      .eq("id", clientId);
  }
}

async function releaseWorkerAfterTerminalJob(workerId: string | null | undefined) {
  if (!workerId) return;
  await supabaseAdmin
    .from("workers")
    .update({ is_available: true, updated_at: new Date().toISOString() })
    .eq("id", workerId);
}

/* ── Cancel / Preview / Termination ───────────────────────── */

export async function cancelJob(userId: string, jobId: string, body: unknown) {
  const reason =
    body && typeof body === "object" && "reason" in body
      ? String((body as { reason?: unknown }).reason ?? "").trim()
      : "";

  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Not allowed to cancel this job", "FORBIDDEN");

  // Determine cancellation stage
  const { stage, canCancel } = determineCancellationStage(job.status, job.updated_at);

  if (!canCancel) {
    throw appError(
      409,
      job.status === JOB_STATUS.IN_PROGRESS || job.status === JOB_STATUS.TERMINATION_REQUESTED
        ? "Cannot cancel a job in progress. Use the termination request instead."
        : "This job cannot be cancelled in its current state.",
      "INVALID_JOB_STATE",
    );
  }

  if (!stage) {
    throw appError(409, "This job cannot be cancelled in its current state.", "INVALID_JOB_STATE");
  }

  // Compute fee
  const feeResult = await computeCancellationFee(job, stage);

  // Update job
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: JOB_STATUS.CANCELLED,
      cancelled_by: "client",
      cancelled_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      cancellation_stage: stage,
      cancellation_fee: feeResult.amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_CANCEL_FAILED");

  // Record in ledger
  await recordCancellation(
    jobId,
    "client",
    stage,
    job.status,
    feeResult.amount,
    feeResult.reason,
    reason,
    feeResult.distanceKm,
  );

  // Increment client cancel count
  await incrementClientCancelCount(userId);

  // Clear dispatch state
  matchingService.clearDispatchState(jobId);

  // Notify worker
  if (job.worker_id) {
    await notifyService.notifyClientCancelledWithFee(
      job.worker_id,
      jobId,
      stage,
      feeResult.amount,
    );
  }
  await releaseWorkerAfterTerminalJob(job.worker_id);

  return data;
}

export async function getCancellationPreview(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Not authorized", "FORBIDDEN");

  const { stage, canCancel } = determineCancellationStage(job.status, job.updated_at);

  if (!stage) {
    return {
      can_cancel: false,
      stage: null,
      fee_amount: 0,
      fee_currency: "GHS",
      fee_reason: "This job cannot be cancelled.",
      warning_title: "Cannot Cancel",
      warning_message: "This job cannot be cancelled in its current state.",
    };
  }

  const feeResult = await computeCancellationFee(job, stage);

  let warningTitle: string;
  let warningMessage: string;

  switch (stage) {
    case CANCELLATION_STAGE.FREE:
      warningTitle = "Cancel this job?";
      warningMessage = "You can cancel this job for free.";
      break;
    case CANCELLATION_STAGE.WARNING:
      warningTitle = "Cancel this job?";
      warningMessage = "Your artisan has already accepted this job. Are you sure you want to cancel?";
      break;
    case CANCELLATION_STAGE.TRAVEL_COMPENSATION:
      warningTitle = "Cancel this job?";
      warningMessage = `Your artisan is on the way. A travel compensation of GH₵ ${feeResult.amount.toFixed(2)} will apply. Please pay this amount directly to the artisan.`;
      break;
    case CANCELLATION_STAGE.SIGNIFICANT_FEE:
      warningTitle = "Cancel this job?";
      warningMessage = `Your artisan has arrived. A cancellation fee of GH₵ ${feeResult.amount.toFixed(2)} will apply. Please pay this amount directly to the artisan.`;
      break;
    case CANCELLATION_STAGE.TERMINATION_REQUESTED:
      warningTitle = "Request Termination";
      warningMessage = "Work has already started. You can request a termination which will be reviewed.";
      break;
    default:
      warningTitle = "Cancel this job?";
      warningMessage = "Are you sure?";
  }

  return {
    can_cancel: canCancel,
    stage,
    fee_amount: feeResult.amount,
    fee_currency: "GHS",
    fee_reason: feeResult.reason,
    warning_title: warningTitle,
    warning_message: warningMessage,
  };
}

export async function requestTermination(userId: string, jobId: string, body: unknown) {
  const reason =
    body && typeof body === "object" && "reason" in body
      ? String((body as { reason?: unknown }).reason ?? "").trim()
      : "";

  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Not allowed", "FORBIDDEN");
  if (job.status === JOB_STATUS.TERMINATION_REQUESTED) return job;
  if (job.status !== JOB_STATUS.IN_PROGRESS) {
    throw appError(409, "Termination can only be requested for jobs in progress", "INVALID_JOB_STATE");
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: JOB_STATUS.TERMINATION_REQUESTED,
      cancelled_reason: reason || "Client requested termination",
      cancellation_stage: CANCELLATION_STAGE.TERMINATION_REQUESTED,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "TERMINATION_REQUEST_FAILED");

  if (job.worker_id) {
    await notifyService.notifyTerminationRequested(
      job.worker_id,
      jobId,
      reason || "The client has requested to terminate this job.",
    );
  }

  return data;
}

export async function requestAnotherWorker(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Not allowed to reopen this job", "FORBIDDEN");
  if ([JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status) && !job.worker_id) return job;
  if (!isRecoverableServiceInterruption(job.status, job.cancelled_by, job.cancellation_stage)) {
    throw appError(
      409,
      "You can request another worker only after a recoverable service interruption",
      "INVALID_JOB_STATE",
    );
  }

  const expiresAt =
    job.job_mode === JOB_MODE.ASAP
      ? new Date(Date.now() + MATCHING.JOB_EXPIRES_MINUTES * 60 * 1000).toISOString()
      : job.expires_at;

  matchingService.clearDispatchState(jobId);

  // Decline any currently accepted applications to prevent auto-matching the old worker again
  await supabaseAdmin
    .from("job_applications")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "accepted");

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update(buildReopenAfterWorkerCancelPatch(new Date().toISOString(), expiresAt))
    .eq("id", jobId)
    .select("*, worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .single();

  if (error) {
    if (isWorkerActiveJobConstraintError(error)) {
      throw appError(
        409,
        "This job cannot be reopened because the worker is currently assigned to another active job",
        "WORKER_HAS_ACTIVE_JOB",
      );
    }
    throw appError(500, error.message, "JOB_REOPEN_FAILED");
  }

  void matchingService.findAndDispatch(jobId, 1);
  return data;
}

export async function completeJob(userId: string, jobId: string) {
  return completeJobWithDetails(userId, jobId, {});
}

export async function completeJobWithDetails(userId: string, jobId: string, body: unknown) {
  const parsed = completeJobSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid completion details", "VALIDATION_ERROR");
  }

  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  if (job.worker_id !== userId) {
    throw appError(403, "Only the assigned worker can submit completion", "FORBIDDEN");
  }
  if (job.status === JOB_STATUS.PENDING_CLIENT_APPROVAL) return job;
  if (job.status !== JOB_STATUS.IN_PROGRESS) {
    throw appError(409, "Job must be in progress before completion", "INVALID_JOB_STATE");
  }

  const input = parsed.data;

  // Auto-calculate hours spent
  let calculatedHours = 1;
  if (job.started_at) {
    const msDiff = Date.now() - new Date(job.started_at).getTime();
    calculatedHours = Math.max(0.1, msDiff / (1000 * 60 * 60));
  }
  const hoursSpent = Math.round(calculatedHours * 100) / 100;

  // Compute settlement fields
  let baseRate = 0;
  if (job.budget_type === "fixed") {
    baseRate = Number(job.budget_fixed ?? 0);
  } else {
    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("hourly_rate")
      .eq("id", job.worker_id)
      .maybeSingle();
    const workerHourlyRate = worker?.hourly_rate ? Number(worker.hourly_rate) : 0;
    const hourlyRate = workerHourlyRate > 0 ? workerHourlyRate : await getCategoryBaseFee(job.category_id);
    baseRate = Math.round(hoursSpent * hourlyRate * 100) / 100;
  }

  let distanceCost = 0;
  if (job.location_lat != null && job.location_lng != null) {
    const KUMASI_CBD_LAT = 6.6885;
    const KUMASI_CBD_LNG = -1.6244;
    const DISTANCE_RATE_PER_KM = 3.0;
    const distanceKm = haversineKm(
      Number(job.location_lat),
      Number(job.location_lng),
      KUMASI_CBD_LAT,
      KUMASI_CBD_LNG,
    );
    distanceCost = Math.round(distanceKm * DISTANCE_RATE_PER_KM);
  }

  const subtotal = baseRate + distanceCost;
  const urgencyPremium = job.job_mode === "asap" ? Math.round(subtotal * 0.20) : 0;

  let grossAmount = Math.round((baseRate + distanceCost + urgencyPremium) * 100) / 100;
  
  if (input.proposed_amount != null && input.proposed_amount > 0) {
    grossAmount = input.proposed_amount;
  }

  const platformFee = Math.round((grossAmount * 0.10) * 100) / 100; // 10% platform fee
  const artisanPayout = Math.round((grossAmount - platformFee) * 100) / 100;

  const { error: detailsError } = await supabaseAdmin.from("job_completion_details").upsert(
    {
      job_id: jobId,
      worker_id: job.worker_id,
      hours_spent: hoursSpent,
      materials_used: input.materials_used ?? null,
      notes: input.notes ?? null,
      photo_urls: input.photo_urls,
      base_rate: baseRate,
      distance_cost: distanceCost,
      urgency_premium: urgencyPremium,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      artisan_payout: artisanPayout,
    },
    { onConflict: "job_id" },
  );

  if (detailsError) throw appError(500, detailsError.message, "JOB_COMPLETION_DETAILS_FAILED");

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: JOB_STATUS.PENDING_CLIENT_APPROVAL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_COMPLETE_FAILED");

  matchingService.clearDispatchState(jobId);
  await notifyService.notifyCompletionSubmitted(job.client_id);

  return data;
}

export async function approveCompletion(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Only the client can approve completion", "FORBIDDEN");
  if (job.status !== JOB_STATUS.PENDING_CLIENT_APPROVAL && job.status !== JOB_STATUS.COMPLETED) {
    throw appError(409, "Job is not waiting for client approval", "INVALID_JOB_STATE");
  }
  if (job.status === JOB_STATUS.COMPLETED) return job;

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.COMPLETED, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_APPROVE_COMPLETION_FAILED");
  matchingService.clearDispatchState(jobId);
  await releaseWorkerAfterTerminalJob(job.worker_id);
  return data;
}

export async function reopenJob(userId: string, jobId: string, body: unknown) {
  const note =
    typeof body === "object" && body !== null && "note" in body
      ? String((body as { note?: unknown }).note ?? "").trim()
      : "";
  if (note.length > 1000) throw appError(400, "Reopen note must be 1000 characters or fewer", "VALIDATION_ERROR");

  const { data: job } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Only the client can reopen this job", "FORBIDDEN");
  if (job.status !== JOB_STATUS.PENDING_CLIENT_APPROVAL) {
    throw appError(409, "Only jobs waiting for client approval can be reopened", "INVALID_JOB_STATE");
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: JOB_STATUS.IN_PROGRESS,
      completion_dispute_note: note || "Client reported the job is not complete.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "JOB_REOPEN_FAILED");
  if (job.worker_id) {
    await notifyService.notifyWorkerNewJob(job.worker_id, {
      id: job.id,
      title: job.title,
      address_label: job.address_label,
    });
  }
  return data;
}

export async function getMyJobs(userId: string, statusFilter?: string[]) {
  let query = supabaseAdmin
    .from("jobs")
    .select("id, title, status, worker_id, requested_worker_id, location_lat, location_lng, job_mode, budget_type, budget_fixed, budget_min, budget_max, address_label, created_at, updated_at, cancelled_by, cancelled_reason, cancelled_at, cancellation_stage, cancellation_fee, cancellation_fee_currency, worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone), requested_worker:profiles!jobs_requested_worker_id_fkey(full_name, avatar_url, phone), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at)")
    .eq("client_id", userId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  return data ?? [];
}

export async function getMatchingProgress(userId: string, jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, requested_worker_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId && job.worker_id !== userId && job.requested_worker_id !== userId) {
    throw appError(403, "Not authorized to view this job", "FORBIDDEN");
  }

  const { data: dispatches, error } = await supabaseAdmin
    .from("job_dispatches")
    .select("round, radius_km, worker_id, created_at")
    .eq("job_id", jobId)
    .order("round", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "MATCHING_PROGRESS_FAILED");

  const rows = dispatches ?? [];
  const currentRound = rows[0]?.round ?? 1;
  const activeRadiusKm = rows[0]?.radius_km ?? MATCHING.RADIUS_STEPS_KM[0];
  const dispatchedCount = rows.filter((row) => row.round === currentRound).length;

  return {
    job_id: jobId,
    status: job.status,
    current_round: currentRound,
    max_rounds: MATCHING.MAX_ROUNDS,
    active_radius_km: Number(activeRadiusKm ?? 0),
    dispatched_count: dispatchedCount,
    radius_steps_km: MATCHING.RADIUS_STEPS_KM,
    is_targeted: Boolean(job.requested_worker_id),
  };
}

export async function getJobById(userId: string, jobId: string) {
  const { data: job, error } = await supabaseAdmin
    .from("jobs")
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at, base_rate, distance_cost, urgency_premium, gross_amount, platform_fee, artisan_payout)")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  // Only participants, including the requested worker before assignment, can view a job.
  if (job.client_id !== userId && job.worker_id !== userId && job.requested_worker_id !== userId) {
    throw appError(403, "Not authorized to view this job", "FORBIDDEN");
  }

  return job;
}
