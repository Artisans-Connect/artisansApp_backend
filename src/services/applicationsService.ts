import { JOB_STATUS, JOB_MODE } from "../constants/enums";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import {
  WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES,
  isWorkerActiveJobConstraintError,
} from "./jobLifecycle";
import * as matchingService from "./matchingService";
import * as notifyService from "./notifyService";
import { quoteForWorkerApplication } from "./workerQuoteService";
import * as negotiationEngine from "./negotiationEngine";

type ApplyToJobInput = {
  message?: unknown;
  proposed_rate?: unknown;
};

function readApplicationInput(body?: ApplyToJobInput) {
  const message =
    typeof body?.message === "string" && body.message.trim().length > 0
      ? body.message.trim()
      : null;
  const proposedRate = Number(body?.proposed_rate);
  return {
    message,
    proposed_rate: Number.isFinite(proposedRate) && proposedRate > 0 ? proposedRate : null,
  };
}

async function ensureWorkerHasNoActiveJob(workerId: string, currentJobId?: string) {
  let query = supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", workerId)
    .in("status", [...WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES]);

  if (currentJobId) {
    query = query.neq("id", currentJobId);
  }

  const { count, error } = await query;
  if (error) throw appError(500, error.message, "ACTIVE_JOB_CHECK_FAILED");
  if ((count ?? 0) > 0) {
    throw appError(409, "This worker already has an active or approval-pending job", "WORKER_HAS_ACTIVE_JOB");
  }
}

export async function applyToJob(workerId: string, jobId: string, body?: ApplyToJobInput) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status, worker_id, job_mode, excluded_worker_ids")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) {
    throw appError(409, "Job is not open for applications", "INVALID_JOB_STATE");
  }
  if (job.worker_id) throw appError(409, "Job already has an assigned worker", "JOB_ALREADY_TAKEN");

  // Prevent workers who previously backed out from re-applying
  const excluded: string[] = (job as any).excluded_worker_ids ?? [];
  if (excluded.includes(workerId)) {
    throw appError(403, "You are not eligible to apply for this job", "WORKER_EXCLUDED");
  }

  const isScheduled = job.job_mode === JOB_MODE.SCHEDULED;

  // Scheduled jobs don't block on today's workload (being busy now says
  // nothing about the scheduled slot) and are open from the explore board
  // without a dispatch round.
  if (!isScheduled) {
    await ensureWorkerHasNoActiveJob(workerId);

    const { data: dispatch } = await supabaseAdmin
      .from("job_dispatches")
      .select("job_id")
      .eq("job_id", jobId)
      .eq("worker_id", workerId)
      .in("status", ["sent", "seen", "accepted"])
      .maybeSingle();

    if (!dispatch) throw appError(403, "This job was not dispatched to you", "FORBIDDEN");
  }

  const patch = readApplicationInput(body);
  const quote = await quoteForWorkerApplication(jobId, workerId);
  const effectiveTotalQuote =
    typeof patch.proposed_rate === "number" && patch.proposed_rate > 0
      ? patch.proposed_rate
      : quote.total_quote;
  const { data: application, error } = await supabaseAdmin
    .from("job_applications")
    .upsert(
      {
        job_id: jobId,
        worker_id: workerId,
        status: "pending",
        message: patch.message,
        proposed_rate: patch.proposed_rate,
        distance_km: quote.distance_km,
        distance_cost: quote.distance_cost,
        base_service_fee: quote.base_service_fee,
        urgency_premium: quote.urgency_premium,
        total_quote: effectiveTotalQuote,
        quote_currency: quote.quote_currency,
        quoted_at: quote.quoted_at,
        last_proposed_by: "worker",
        counter_rate: null,
      },
      { onConflict: "job_id,worker_id" },
    )
    .select("id, job_id, worker_id, status, message, proposed_rate, distance_km, distance_cost, base_service_fee, urgency_premium, total_quote, quote_currency, quoted_at, created_at")
    .single();

  if (error) throw appError(500, error.message, "JOB_APPLICATION_FAILED");

  await matchingService.markDispatchAccepted(jobId, workerId);
  const { data: workerProfile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", workerId)
    .maybeSingle();
  await notifyService.notifyClientWorkerApplied(
    job.client_id,
    jobId,
    workerProfile?.full_name ?? "An artisan",
  );

  return application;
}

export async function listApplicationsForJob(clientId: string, jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== clientId) throw appError(403, "Not authorized to view applications", "FORBIDDEN");

  const { data: applications, error } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, job_id, worker_id, status, message, proposed_rate, counter_rate, last_proposed_by, distance_km, distance_cost, base_service_fee, urgency_premium, total_quote, quote_currency, quoted_at, created_at, worker:profiles!job_applications_worker_id_fkey(full_name, avatar_url, phone)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw appError(500, error.message, "APPLICATIONS_FETCH_FAILED");

  const workerIds = (applications ?? []).map((app) => app.worker_id).filter(Boolean);
  const { data: workers } = workerIds.length
    ? await supabaseAdmin
        .from("workers")
        .select("id, rating, total_jobs, skills, is_verified")
        .in("id", workerIds)
    : { data: [] };

  const statsByWorker = new Map((workers ?? []).map((worker) => [worker.id, worker]));
  return (applications ?? []).map((application) => ({
    ...application,
    worker_stats: statsByWorker.get(application.worker_id) ?? null,
  }));
}

export async function listWorkerApplications(workerId: string) {
  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, job_id, worker_id, status, message, proposed_rate, counter_rate, last_proposed_by, distance_km, distance_cost, base_service_fee, urgency_premium, total_quote, quote_currency, quoted_at, created_at, job:jobs!job_applications_job_id_fkey(id, title, status, address_label, budget_fixed, budget_min, budget_max, created_at, categories(name, icon_name, color_hex))",
    )
    .eq("worker_id", workerId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "WORKER_APPLICATIONS_FETCH_FAILED");
  const terminalJobStatuses = new Set<string>([
    JOB_STATUS.EXPIRED,
    JOB_STATUS.CANCELLED,
    JOB_STATUS.COMPLETED,
  ]);
  const openApplicationJobStatuses = new Set<string>([
    JOB_STATUS.SEARCHING,
    JOB_STATUS.MATCHING,
  ]);

  return (data ?? []).filter((application) => {
    const job = Array.isArray(application.job) ? application.job[0] : application.job;
    const jobStatus = typeof job?.status === "string" ? job.status : "";
    if (terminalJobStatuses.has(jobStatus)) {
      return false;
    }
    if (application.status === "pending") {
      return openApplicationJobStatuses.has(jobStatus);
    }
    return true;
  });
}

export async function acceptApplication(clientId: string, jobId: string, applicationId: string) {
  const { data: application, error: applicationError } = await supabaseAdmin
    .from("job_applications")
    .select("id, job_id, worker_id, status")
    .eq("id", applicationId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (applicationError) throw appError(500, applicationError.message, "APPLICATION_FETCH_FAILED");
  if (!application) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");
  if (application.status !== "pending") throw appError(409, "Application is no longer pending", "INVALID_APPLICATION_STATE");

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status, worker_id, job_mode")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== clientId) throw appError(403, "Not authorized to accept applications", "FORBIDDEN");
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status) || job.worker_id) {
    throw appError(409, "Job is no longer accepting applicants", "INVALID_JOB_STATE");
  }
  // Scheduled jobs confirm the worker without blocking them: the job only
  // becomes an active assignment (matched) near the scheduled time, so the
  // worker's current workload is irrelevant here.
  const isScheduled = job.job_mode === JOB_MODE.SCHEDULED;
  if (!isScheduled) {
    await ensureWorkerHasNoActiveJob(application.worker_id, jobId);
  }
  const nextStatus = JOB_STATUS.AWAITING_PAYMENT;

  const now = new Date().toISOString();
  const { data: updatedJob, error: updateError } = await supabaseAdmin
    .from("jobs")
    .update({ status: nextStatus, worker_id: application.worker_id, updated_at: now })
    .eq("id", jobId)
    .eq("client_id", clientId)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .select("*, worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .maybeSingle();

  if (updateError) {
    if (isWorkerActiveJobConstraintError(updateError)) {
      throw appError(409, "This worker already has an active or approval-pending job", "WORKER_HAS_ACTIVE_JOB");
    }
    throw appError(500, updateError.message, "JOB_ASSIGN_FAILED");
  }
  if (!updatedJob) throw appError(409, "Job is no longer available", "JOB_ALREADY_TAKEN");

  const { error: acceptStatusError } = await supabaseAdmin
    .from("job_applications")
    .update({ status: "accepted" })
    .eq("id", applicationId);
  if (acceptStatusError) throw appError(500, acceptStatusError.message, "APPLICATION_STATUS_UPDATE_FAILED");

  const { error: declineStatusError } = await supabaseAdmin
    .from("job_applications")
    .update({ status: "declined" })
    .eq("job_id", jobId)
    .neq("id", applicationId)
    .eq("status", "pending");
  if (declineStatusError) throw appError(500, declineStatusError.message, "APPLICATION_STATUS_UPDATE_FAILED");

  matchingService.clearDispatchState(jobId);
  await matchingService.markDispatchAccepted(jobId, application.worker_id);
  await matchingService.markDispatchesExpired(jobId, application.worker_id);
  await notifyService.notifyWorkerApplicationAccepted(application.worker_id, jobId);

  if (updatedJob && updatedJob.job_mode === JOB_MODE.ASAP) {
    await supabaseAdmin
      .from("workers")
      .update({ is_available: false, updated_at: now })
      .eq("id", application.worker_id);
  }

  return updatedJob;
}

export async function withdrawApplication(workerId: string, jobId: string) {
  const { data: app, error: fetchError } = await supabaseAdmin
    .from("job_applications")
    .select("status")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .maybeSingle();

  if (fetchError) throw appError(500, fetchError.message, "FETCH_APPLICATION_FAILED");
  if (!app) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");

  if (app.status === "accepted") {
    // If the application was accepted, they can only withdraw if the job is still awaiting payment
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("jobs")
      .select("status, client_id, excluded_worker_ids")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) throw appError(500, jobErr.message, "FETCH_JOB_FAILED");
    if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

    if (job.status !== JOB_STATUS.AWAITING_PAYMENT) {
      throw appError(400, "Cannot withdraw application after payment has been completed. Use the job cancellation flow instead.", "INVALID_APPLICATION_STATE");
    }

    // Reset job back to searching/matching, clear worker_id, and exclude the withdrawing worker
    const existingExcluded: string[] = (job as any).excluded_worker_ids ?? [];
    const updatedExcluded = [...new Set([...existingExcluded, workerId])];

    const { error: jobUpdateErr } = await supabaseAdmin
      .from("jobs")
      .update({
        status: JOB_STATUS.SEARCHING,
        worker_id: null,
        excluded_worker_ids: updatedExcluded,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);

    if (jobUpdateErr) throw appError(500, jobUpdateErr.message, "JOB_UPDATE_FAILED");

    // Set the application to withdrawn
    const { error: updateError } = await supabaseAdmin
      .from("job_applications")
      .update({ status: "withdrawn" })
      .eq("job_id", jobId)
      .eq("worker_id", workerId);

    if (updateError) throw appError(500, updateError.message, "WITHDRAW_APPLICATION_FAILED");

    // Notify the client
    await notifyService.sendToUser(job.client_id, {
      title: "Artisan Withdrew Interest",
      body: "The selected artisan withdrew their interest. Your job is back in search.",
      data: { jobId, type: "worker_withdrew" }
    });

    await matchingService.recordDecline(jobId, workerId);
    return { success: true };
  }

  if (app.status !== "pending") {
    throw appError(400, "Only pending applications can be withdrawn", "INVALID_APPLICATION_STATE");
  }

  const { error: updateError } = await supabaseAdmin
    .from("job_applications")
    .update({ status: "withdrawn" })
    .eq("job_id", jobId)
    .eq("worker_id", workerId);

  if (updateError) throw appError(500, updateError.message, "WITHDRAW_APPLICATION_FAILED");

  await matchingService.recordDecline(jobId, workerId);

  return { success: true };
}

export async function counterApplication(clientId: string, applicationId: string, counterRate: number) {
  const { data: application, error: applicationError } = await supabaseAdmin
    .from("job_applications")
    .select("*, jobs(client_id)")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) throw appError(500, applicationError.message, "APPLICATION_FETCH_FAILED");
  if (!application) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");
  if (application.status !== "pending") {
    throw appError(400, "Only pending applications can be countered", "INVALID_APPLICATION_STATE");
  }

  const job = application.jobs as any;
  if (job.client_id !== clientId) {
    throw appError(403, "Not authorized to counter this application", "FORBIDDEN");
  }

  // Find or create negotiation
  let negotiationId: string;
  const { data: existingNeg } = await supabaseAdmin
    .from("negotiations")
    .select("id")
    .eq("application_id", applicationId)
    .eq("type", "quote")
    .maybeSingle();

  if (existingNeg) {
    negotiationId = existingNeg.id;
  } else {
    const newNeg = await negotiationEngine.createNegotiation({
      jobId: application.job_id,
      applicationId,
      type: "quote",
      initiatorId: application.worker_id,
      initialAmount: Number(application.total_quote),
      description: "Job bidding initiated"
    });
    negotiationId = newNeg.id;
  }

  // Submit counter-offer to negotiation engine
  await negotiationEngine.proposeAmount(negotiationId, clientId, counterRate, "Client counter-offer");

  const { data: updatedApp, error: updateError } = await supabaseAdmin
    .from("job_applications")
    .update({
      last_proposed_by: "client",
      counter_rate: counterRate,
    })
    .eq("id", applicationId)
    .select()
    .single();

  if (updateError) throw appError(500, updateError.message, "APPLICATION_COUNTER_FAILED");

  return updatedApp;
}

export async function acceptCounterOffer(workerId: string, applicationId: string) {
  const { data: application, error: applicationError } = await supabaseAdmin
    .from("job_applications")
    .select("*, jobs(client_id, status, job_mode)")
    .eq("id", applicationId)
    .eq("worker_id", workerId)
    .maybeSingle();

  if (applicationError) throw appError(500, applicationError.message, "APPLICATION_FETCH_FAILED");
  if (!application) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");
  if (application.status !== "pending" || application.last_proposed_by !== "client" || !application.counter_rate) {
    throw appError(400, "No pending counter offer from client exists for this application", "INVALID_APPLICATION_STATE");
  }

  const job = application.jobs as any;
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) {
    throw appError(409, "Job is no longer open for applications", "INVALID_JOB_STATE");
  }

  // Find the open negotiation
  const { data: existingNeg } = await supabaseAdmin
    .from("negotiations")
    .select("id")
    .eq("application_id", applicationId)
    .eq("type", "quote")
    .eq("status", "open")
    .maybeSingle();

  if (!existingNeg) {
    throw appError(400, "No open negotiation found for this application", "NEGOTIATION_NOT_FOUND");
  }

  // Accept current proposal in the negotiation engine
  await negotiationEngine.acceptCurrentProposal(existingNeg.id, workerId);

  // Fetch and return updated job
  const { data: updatedJob, error: jobFetchError } = await supabaseAdmin
    .from("jobs")
    .select("*, worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .eq("id", application.job_id)
    .single();

  if (jobFetchError) throw appError(500, jobFetchError.message, "JOB_FETCH_FAILED");

  return updatedJob;
}

