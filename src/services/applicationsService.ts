import { JOB_STATUS } from "../constants/enums";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as matchingService from "./matchingService";
import * as notifyService from "./notifyService";

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

export async function applyToJob(workerId: string, jobId: string, body?: ApplyToJobInput) {
  const { data: dispatch } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id")
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["sent", "seen", "accepted"])
    .maybeSingle();

  if (!dispatch) throw appError(403, "This job was not dispatched to you", "FORBIDDEN");

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status, worker_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) {
    throw appError(409, "Job is not open for applications", "INVALID_JOB_STATE");
  }
  if (job.worker_id) throw appError(409, "Job already has an assigned worker", "JOB_ALREADY_TAKEN");

  const patch = readApplicationInput(body);
  const { data: application, error } = await supabaseAdmin
    .from("job_applications")
    .upsert(
      {
        job_id: jobId,
        worker_id: workerId,
        status: "pending",
        message: patch.message,
        proposed_rate: patch.proposed_rate,
      },
      { onConflict: "job_id,worker_id" },
    )
    .select("id, job_id, worker_id, status, message, proposed_rate, created_at")
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
      "id, job_id, worker_id, status, message, proposed_rate, created_at, worker:profiles!job_applications_worker_id_fkey(full_name, avatar_url, phone)",
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
      "id, job_id, worker_id, status, message, proposed_rate, created_at, job:jobs!job_applications_job_id_fkey(id, title, status, address_label, budget_fixed, budget_min, budget_max, created_at, categories(name))",
    )
    .eq("worker_id", workerId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "WORKER_APPLICATIONS_FETCH_FAILED");
  return data ?? [];
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
    .select("id, client_id, status, worker_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== clientId) throw appError(403, "Not authorized to accept applications", "FORBIDDEN");
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status) || job.worker_id) {
    throw appError(409, "Job is no longer accepting applicants", "INVALID_JOB_STATE");
  }

  const now = new Date().toISOString();
  const { data: updatedJob, error: updateError } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.MATCHED, worker_id: application.worker_id, updated_at: now })
    .eq("id", jobId)
    .eq("client_id", clientId)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .select("*, worker:profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .maybeSingle();

  if (updateError) throw appError(500, updateError.message, "JOB_ASSIGN_FAILED");
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

  return updatedJob;
}
