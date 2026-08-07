import { supabaseAdmin } from "../../config/supabase";
import { JOB_STATUS, MATCHING } from "../../constants/enums";
import { appError } from "../../utils/appError";
import { logger } from "../../utils/logger";
import {
  REDISPATCH_BLOCKING_DISPATCH_STATUSES,
  SCHEDULED_JOB_ACTIVATION_LEAD_MS,
  hasMatchingWindowExpired,
  isWorkerActiveJobConstraintError,
  shouldActivateScheduledJob,
} from "../jobLifecycle";
import * as notifyService from "../notifyService";
import { DispatchState, WorkerRow } from "./matchingTypes";
import { fetchCandidateWorkers, rankWorkers } from "./scoringService";

const dispatchStateByJob = new Map<string, DispatchState>();

function getState(jobId: string): DispatchState {
  let state = dispatchStateByJob.get(jobId);
  if (!state) {
    state = {
      round: 1,
      radiusIndex: 0,
    };
    dispatchStateByJob.set(jobId, state);
  }
  return state;
}

export function clearDispatchState(jobId: string): void {
  const state = dispatchStateByJob.get(jobId);
  if (state?.timeout) clearTimeout(state.timeout);
  dispatchStateByJob.delete(jobId);
}

export async function fetchJob(jobId: string) {
  const { data, error } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  return data;
}

async function recordDispatches(
  jobId: string,
  workers: WorkerRow[],
  round: number,
  radiusKm: number,
): Promise<void> {
  if (workers.length === 0) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MATCHING.ROUND_TIMEOUT_MS).toISOString();
  const rows = workers.map((w) => ({
    job_id: jobId,
    worker_id: w.id,
    round,
    radius_km: radiusKm,
    status: "sent",
    expires_at: expiresAt,
    notified_at: now.toISOString(),
    responded_at: null,
  }));
  const { error } = await supabaseAdmin.from("job_dispatches").upsert(rows, {
    onConflict: "job_id,worker_id,round",
  });
  if (error) logger(`job_dispatches insert warning: ${error.message}`);
}

export async function dispatchToWorker(
  jobId: string,
  workerId: string,
  round = 1,
  radiusKm = 0,
  expiresAtIso?: string,
): Promise<void> {
  const now = new Date();
  const { error } = await supabaseAdmin.from("job_dispatches").upsert(
    {
      job_id: jobId,
      worker_id: workerId,
      round,
      radius_km: radiusKm,
      status: "sent",
      expires_at: expiresAtIso ?? new Date(now.getTime() + MATCHING.ROUND_TIMEOUT_MS).toISOString(),
      notified_at: now.toISOString(),
      responded_at: null,
    },
    {
      onConflict: "job_id,worker_id,round",
    },
  );
  if (error) logger(`targeted job_dispatch insert warning: ${error.message}`);
}

async function getDispatchedWorkerIds(jobId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("job_dispatches")
    .select("worker_id")
    .eq("job_id", jobId)
    .in("status", [...REDISPATCH_BLOCKING_DISPATCH_STATUSES]);
  if (error) {
    logger(`job_dispatches exclude warning: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.worker_id as string));
}

export async function markDispatchesExpired(jobId: string, exceptWorkerId?: string): Promise<void> {
  let query = supabaseAdmin
    .from("job_dispatches")
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .in("status", ["sent", "seen"]);

  if (exceptWorkerId) {
    query = query.neq("worker_id", exceptWorkerId);
  }

  const { error } = await query;
  if (error) logger(`dispatch expiry warning: ${error.message}`);
}

export async function markDispatchAccepted(jobId: string, workerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("job_dispatches")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["sent", "seen"]);
  if (error) logger(`dispatch accept warning: ${error.message}`);
}

export async function markWorkerCancelledDispatch(jobId: string, workerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("job_dispatches")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["sent", "seen", "accepted"]);
  if (error) logger(`dispatch worker-cancel warning: ${error.message}`);
}

export async function expireJob(jobId: string): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if ([JOB_STATUS.MATCHED, JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED, JOB_STATUS.EXPIRED].includes(job.status)) {
    return;
  }

  await supabaseAdmin.from("jobs").update({ status: JOB_STATUS.EXPIRED }).eq("id", jobId);
  await markDispatchesExpired(jobId);
  clearDispatchState(jobId);
  await notifyService.notifyJobExpired(job.client_id, jobId);
}

export async function findAndDispatch(jobId: string, round = 1): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) return;
  if (job.job_mode === "scheduled" && !shouldActivateScheduledJob(job.scheduled_for)) return;

  const state = getState(jobId);
  if (state.round !== round) {
    state.radiusIndex = 0;
  }
  state.round = round;

  await expireTimedOutDispatches(jobId);
  const exclude = await getDispatchedWorkerIds(jobId);

  let batch: WorkerRow[] = [];
  let radiusKm = MATCHING.RADIUS_STEPS_KM[state.radiusIndex] ?? MATCHING.RADIUS_STEPS_KM.at(-1)!;

  while (batch.length === 0 && state.radiusIndex < MATCHING.RADIUS_STEPS_KM.length) {
    radiusKm = MATCHING.RADIUS_STEPS_KM[state.radiusIndex]!;
    batch = await rankWorkers(
      await fetchCandidateWorkers(job as any, exclude, radiusKm),
      job as any,
      MATCHING.WORKERS_PER_ROUND,
    );
    if (batch.length === 0) {
      state.radiusIndex += 1;
    }
  }

  if (batch.length === 0) {
    if (round >= MATCHING.MAX_ROUNDS) {
      if (hasMatchingWindowExpired(job.expires_at)) {
        await expireJob(jobId);
      } else {
        scheduleReDispatch(jobId, 0);
      }
    } else {
      scheduleReDispatch(jobId, round);
    }
    return;
  }

  await supabaseAdmin.from("jobs").update({ status: JOB_STATUS.MATCHING }).eq("id", jobId);
  await recordDispatches(jobId, batch, round, radiusKm);

  for (const worker of batch) {
    await notifyService.notifyWorkerNewJob(worker.id, {
      id: job.id,
      title: job.title,
      address_label: job.address_label,
    });
  }

  scheduleReDispatch(jobId, round);
}

function scheduleReDispatch(jobId: string, round: number): void {
  const state = getState(jobId);
  if (state.timeout) clearTimeout(state.timeout);

  state.timeout = setTimeout(() => {
    void checkAndReDispatch(jobId, round);
  }, MATCHING.ROUND_TIMEOUT_MS);
}

export async function checkAndReDispatch(jobId: string, round: number): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) {
    clearDispatchState(jobId);
    return;
  }

  await expireTimedOutDispatches(jobId);

  if (round >= MATCHING.MAX_ROUNDS) {
    if (hasMatchingWindowExpired(job.expires_at)) {
      await expireJob(jobId);
    } else {
      await findAndDispatch(jobId, 1);
    }
    return;
  }

  await findAndDispatch(jobId, round + 1);
}

export async function recordDecline(jobId: string, workerId: string): Promise<void> {
  const { error: declineError } = await supabaseAdmin
    .from("job_dispatches")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("worker_id", workerId)
    .in("status", ["sent", "seen"]);
  if (declineError) logger(`dispatch decline warning: ${declineError.message}`);

  const job = await fetchJob(jobId);
  if (!job || ![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) return;

  await expireTimedOutDispatches(jobId);

  const active = await getActiveDispatchCount(jobId);
  if (active === 0) {
    const state = getState(jobId);
    if (state.timeout) clearTimeout(state.timeout);
    if (job.requested_worker_id || state.round >= MATCHING.MAX_ROUNDS) {
      if (hasMatchingWindowExpired(job.expires_at)) {
        await expireJob(jobId);
      } else {
        await findAndDispatch(jobId, 1);
      }
    } else {
      await findAndDispatch(jobId, state.round + 1);
    }
  }
}

async function getActiveDispatchCount(jobId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["sent", "seen"]);
  if (error) {
    logger(`active dispatch count warning: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

export async function expireTimedOutDispatches(jobId?: string): Promise<void> {
  const now = new Date().toISOString();
  let query = supabaseAdmin
    .from("job_dispatches")
    .update({ status: "expired", responded_at: now })
    .lt("expires_at", now)
    .in("status", ["sent", "seen"]);

  if (jobId) query = query.eq("job_id", jobId);

  const { error } = await query;
  if (error) logger(`timed-out dispatch expiry warning: ${error.message}`);
}

export async function recoverTimedOutMatchingJobs(): Promise<void> {
  await expireTimedOutDispatches();

  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select("id, status")
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .neq("job_mode", "scheduled");

  if (error) {
    logger(`matching recovery fetch warning: ${error.message}`);
    return;
  }

  for (const job of jobs ?? []) {
    const active = await getActiveDispatchCount(job.id);
    if (active > 0) continue;

    const round = await getLatestDispatchRound(job.id);
    if (round >= MATCHING.MAX_ROUNDS) {
      const fullJob = await fetchJob(job.id);
      if (hasMatchingWindowExpired(fullJob?.expires_at)) {
        await expireJob(job.id);
      } else {
        await findAndDispatch(job.id, 1);
      }
    } else {
      await findAndDispatch(job.id, round + 1);
    }
  }
}

async function getLatestDispatchRound(jobId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("job_dispatches")
    .select("round")
    .eq("job_id", jobId)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger(`latest dispatch round warning: ${error.message}`);
    return 0;
  }

  return Number(data?.round ?? 0);
}

export async function activateDueScheduledJobs(
  now = new Date(),
  leadMs = SCHEDULED_JOB_ACTIVATION_LEAD_MS,
): Promise<void> {
  const activateBefore = new Date(now.getTime() + leadMs).toISOString();

  await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.SEARCHING, updated_at: now.toISOString() })
    .eq("status", JOB_STATUS.DRAFT)
    .eq("job_mode", "scheduled");

  const { data: confirmedJobs, error: confirmedError } = await supabaseAdmin
    .from("jobs")
    .select("id, title, address_label, client_id, worker_id, scheduled_for")
    .eq("status", JOB_STATUS.SCHEDULED_CONFIRMED)
    .eq("job_mode", "scheduled")
    .lte("scheduled_for", activateBefore);

  if (confirmedError) {
    logger(`scheduled activation fetch warning: ${confirmedError.message}`);
    return;
  }

  for (const job of confirmedJobs ?? []) {
    const { error: updateError } = await supabaseAdmin
      .from("jobs")
      .update({ status: JOB_STATUS.MATCHED, updated_at: now.toISOString() })
      .eq("id", job.id)
      .eq("status", JOB_STATUS.SCHEDULED_CONFIRMED);

    if (!updateError) continue;

    if (!isWorkerActiveJobConstraintError(updateError)) {
      logger(`scheduled activation update warning: ${updateError.message}`);
      continue;
    }

    const slotPassed = job.scheduled_for && new Date(job.scheduled_for).getTime() <= now.getTime();
    if (!slotPassed) continue;

    const { data: released, error: releaseError } = await supabaseAdmin
      .from("jobs")
      .update({
        status: JOB_STATUS.SEARCHING,
        worker_id: null,
        requested_worker_id: null,
        updated_at: now.toISOString(),
      })
      .eq("id", job.id)
      .eq("status", JOB_STATUS.SCHEDULED_CONFIRMED)
      .select("id")
      .maybeSingle();

    if (releaseError) {
      logger(`scheduled activation release warning: ${releaseError.message}`);
      continue;
    }
    if (!released) continue;

    if (job.worker_id) {
      await notifyService.notifyScheduledActivationBlocked(job.client_id, job.worker_id, job.id);
    }
    void findAndDispatch(job.id, 1);
  }

  const { data: unconfirmedJobs, error: unconfirmedError } = await supabaseAdmin
    .from("jobs")
    .select("id, worker_id")
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .eq("job_mode", "scheduled")
    .is("worker_id", null)
    .lte("scheduled_for", activateBefore);

  if (unconfirmedError) {
    logger(`scheduled unconfirmed fetch warning: ${unconfirmedError.message}`);
    return;
  }

  for (const job of unconfirmedJobs ?? []) {
    void findAndDispatch(job.id, 1);
  }
}

export async function expireStaleJobs(): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status")
    .lt("expires_at", now)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING]);

  for (const job of data ?? []) {
    await expireJob(job.id);
  }
}

export async function sendScheduledReminders(): Promise<void> {
  const now = Date.now();
  const from = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, scheduled_for, status")
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .is("reminder_24h_sent_at", null)
    .in("status", [
      JOB_STATUS.DRAFT,
      JOB_STATUS.SEARCHING,
      JOB_STATUS.MATCHING,
      JOB_STATUS.SCHEDULED_CONFIRMED,
      JOB_STATUS.MATCHED,
      JOB_STATUS.IN_PROGRESS,
    ]);

  for (const job of jobs ?? []) {
    const { data: stamped } = await supabaseAdmin
      .from("jobs")
      .update({ reminder_24h_sent_at: new Date(now).toISOString() })
      .eq("id", job.id)
      .is("reminder_24h_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!stamped) continue;

    if (job.worker_id) {
      const { data: workerProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", job.worker_id)
        .maybeSingle();
      await notifyService.notifyScheduledReminder(job.client_id, job.id, workerProfile?.full_name ?? "your artisan");
      const { data: jobTitle } = await supabaseAdmin
        .from("jobs")
        .select("title")
        .eq("id", job.id)
        .maybeSingle();
      await notifyService.notifyWorkerScheduledDayOf(job.worker_id, job.id, jobTitle?.title ?? "Your scheduled job");
    } else {
      await notifyService.notifyScheduledReminderUnmatched(job.client_id, job.id);
    }
    logger(`Scheduled reminder sent for job ${job.id}`);
  }
}

export async function sendScheduledWorkerReminders(): Promise<void> {
  const now = Date.now();
  const to = new Date(now + 2 * 60 * 60 * 1000).toISOString();

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, title, worker_id, scheduled_for")
    .eq("job_mode", "scheduled")
    .not("worker_id", "is", null)
    .is("reminder_2h_sent_at", null)
    .gte("scheduled_for", new Date(now).toISOString())
    .lte("scheduled_for", to)
    .in("status", [JOB_STATUS.SCHEDULED_CONFIRMED, JOB_STATUS.MATCHED]);

  for (const job of jobs ?? []) {
    const { data: stamped } = await supabaseAdmin
      .from("jobs")
      .update({ reminder_2h_sent_at: new Date(now).toISOString() })
      .eq("id", job.id)
      .is("reminder_2h_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!stamped) continue;

    await notifyService.notifyWorkerScheduledSoon(job.worker_id, job.id, job.title ?? "Your scheduled job");
    logger(`Scheduled 2h worker reminder sent for job ${job.id}`);
  }
}
