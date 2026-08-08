import { supabaseAdmin } from "../../config/supabase";
import { appError } from "../../utils/appError";
import { JOB_STATUS, CANCELLATION_STAGE } from "../../constants/enums";
import { ACTIVE_WORKER_JOB_STATUSES, WORKER_RECOVERABLE_JOB_STATUSES } from "../jobLifecycle";
import * as matchingService from "../matchingService";
import * as notifyService from "../notifyService";
import * as applicationsService from "../applicationsService";
import { recordWorkerCancellation } from "../jobsService";
import { quotePreviewForWorker } from "../workerQuoteService";
import { setWorkerAvailabilityAfterTerminalJob } from "./workerStatusService";

export async function acceptJob(userId: string, jobId: string, body?: { message?: unknown; proposed_rate?: unknown }) {
  return applicationsService.applyToJob(userId, jobId, body);
}

export async function declineJob(userId: string, jobId: string) {
  const { data: dispatch } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id")
    .eq("job_id", jobId)
    .eq("worker_id", userId)
    .in("status", ["sent", "seen"])
    .maybeSingle();

  if (!dispatch) throw appError(403, "This job was not dispatched to you", "FORBIDDEN");

  const { data: job } = await supabaseAdmin.from("jobs").select("id, status").eq("id", jobId).maybeSingle();
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) {
    throw appError(400, "Job is not open for decline", "INVALID_JOB_STATE");
  }

  await matchingService.recordDecline(jobId, userId);
  return { success: true };
}

export async function getActiveJob(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at, base_rate, distance_cost, urgency_premium, gross_amount, platform_fee, artisan_payout)")
    .eq("worker_id", userId)
    .in("status", WORKER_RECOVERABLE_JOB_STATUSES)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (error) throw appError(500, error.message, "ACTIVE_JOB_FETCH_FAILED");
  return data ? enrichActiveJobWithAcceptedQuote(data, userId) : data;
}

async function enrichActiveJobWithAcceptedQuote<T extends { id: string }>(
  job: T,
  workerId: string,
) {
  const { data: quote, error } = await supabaseAdmin
    .from("job_applications")
    .select("proposed_rate, distance_km, distance_cost, base_service_fee, urgency_premium, total_quote, quote_currency, quoted_at")
    .eq("job_id", job.id)
    .eq("worker_id", workerId)
    .in("status", ["accepted", "pending"])
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw appError(500, error.message, "APPLICATION_QUOTE_FETCH_FAILED");
  return quote ? { ...job, application_quote: quote } : job;
}

async function transitionAssignedJob(
  userId: string,
  jobId: string,
  allowedStatuses: string[],
  nextStatus: string,
  errorMessage: string,
  extraUpdates: Record<string, unknown> = {},
) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: nextStatus, updated_at: new Date().toISOString(), ...extraUpdates })
    .eq("id", jobId)
    .eq("worker_id", userId)
    .in("status", allowedStatuses)
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex)")
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_TRANSITION_FAILED");
  if (!data) throw appError(409, errorMessage, "INVALID_JOB_STATE");
  return data;
}

export async function markOnTheWay(userId: string, jobId: string) {
  const { data: workerLocation } = await supabaseAdmin
    .from("workers")
    .select("current_lat, current_lng")
    .eq("id", userId)
    .maybeSingle();

  const originUpdates: Record<string, unknown> = {};
  if (workerLocation?.current_lat != null && workerLocation?.current_lng != null) {
    originUpdates.worker_origin_lat = workerLocation.current_lat;
    originUpdates.worker_origin_lng = workerLocation.current_lng;
  }

  const data = await transitionAssignedJob(
    userId,
    jobId,
    [JOB_STATUS.MATCHED],
    JOB_STATUS.ON_THE_WAY,
    "Job can only be marked on the way after it is accepted",
    originUpdates,
  );
  await notifyService.notifyWorkerOnTheWay(data.client_id, jobId);
  await supabaseAdmin
    .from("workers")
    .update({ is_available: false, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return data;
}

export async function markArrived(userId: string, jobId: string) {
  const data = await transitionAssignedJob(
    userId,
    jobId,
    [JOB_STATUS.MATCHED, JOB_STATUS.ON_THE_WAY],
    JOB_STATUS.ARRIVED,
    "Job can only be marked arrived before work starts",
  );
  await notifyService.notifyWorkerArrived(data.client_id, jobId);
  return data;
}

export async function startJob(userId: string, jobId: string) {
  const data = await transitionAssignedJob(
    userId,
    jobId,
    [JOB_STATUS.ARRIVED],
    JOB_STATUS.IN_PROGRESS,
    "Job can only be started after you mark arrival",
    { started_at: new Date().toISOString() },
  );

  await notifyService.notifyJobStarted(data.client_id, jobId);
  await supabaseAdmin
    .from("workers")
    .update({ is_available: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  return data;
}

export async function cancelAssignedJob(userId: string, jobId: string, body: unknown) {
  const reason =
    body && typeof body === "object" && "reason" in body
      ? String((body as { reason?: unknown }).reason ?? "").trim()
      : "";

  const { data: before } = await supabaseAdmin
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .eq("worker_id", userId)
    .maybeSingle();

  if (before?.status === JOB_STATUS.AWAITING_PAYMENT) {
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from("jobs")
      .update({
        status: JOB_STATUS.SEARCHING,
        worker_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("worker_id", userId)
      .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex)")
      .maybeSingle();

    if (updateError) throw appError(500, updateError.message, "JOB_CANCEL_FAILED");
    if (!updatedJob) throw appError(409, "Job not found or not assigned to you", "JOB_NOT_FOUND");

    await supabaseAdmin
      .from("job_applications")
      .update({ status: "withdrawn" })
      .eq("job_id", jobId)
      .eq("worker_id", userId);

    await notifyService.sendToUser(updatedJob.client_id, {
      title: "Artisan Withdrew Interest",
      body: "The selected artisan withdrew their interest. Your job is back in search.",
      data: { jobId, type: "worker_withdrew" }
    });

    await setWorkerAvailabilityAfterTerminalJob(userId, true);
    return updatedJob;
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: JOB_STATUS.CANCELLED,
      cancelled_by: "worker",
      cancelled_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("worker_id", userId)
    .in("status", [
      ...ACTIVE_WORKER_JOB_STATUSES,
      JOB_STATUS.SCHEDULED_CONFIRMED,
      JOB_STATUS.PENDING_CLIENT_APPROVAL,
    ])
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex)")
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_CANCEL_FAILED");
  if (!data) throw appError(409, "Only your active assigned or pending approval jobs can be cancelled", "INVALID_JOB_STATE");

  await recordWorkerCancellation(jobId, userId, before?.status ?? JOB_STATUS.MATCHED, reason);

  const { error: appStatusError } = await supabaseAdmin
    .from("job_applications")
    .update({ status: "withdrawn" })
    .eq("job_id", jobId)
    .eq("worker_id", userId);
  if (appStatusError) {
    console.error("Warning: failed to update application status to withdrawn:", appStatusError.message);
  }

  matchingService.clearDispatchState(jobId);
  await matchingService.markWorkerCancelledDispatch(jobId, userId);
  await notifyService.notifyWorkerCancelledJob(data.client_id, jobId);
  await setWorkerAvailabilityAfterTerminalJob(userId, true);
  return data;
}

export async function respondToTermination(userId: string, jobId: string, body: unknown) {
  const accept =
    body && typeof body === "object" && "accept" in body
      ? Boolean((body as { accept?: unknown }).accept)
      : false;

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("worker_id", userId)
    .eq("status", JOB_STATUS.TERMINATION_REQUESTED)
    .maybeSingle();

  if (!job) throw appError(409, "No termination request pending for this job", "INVALID_JOB_STATE");

  if (accept) {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .update({
        status: JOB_STATUS.CANCELLED,
        cancelled_by: "client",
        cancelled_at: new Date().toISOString(),
        cancellation_stage: CANCELLATION_STAGE.TERMINATION_REQUESTED,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) throw appError(500, error.message, "TERMINATION_ACCEPT_FAILED");

    matchingService.clearDispatchState(jobId);
    await notifyService.notifyTerminationResolved(job.client_id, jobId, true);
    await setWorkerAvailabilityAfterTerminalJob(userId, true);
    return data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .update({
        status: JOB_STATUS.IN_PROGRESS,
        cancelled_reason: null,
        cancellation_stage: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) throw appError(500, error.message, "TERMINATION_DECLINE_FAILED");

    await notifyService.notifyTerminationResolved(job.client_id, jobId, false);
    return data;
  }
}
