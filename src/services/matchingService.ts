import { supabaseAdmin } from "../config/supabase";
import { JOB_STATUS, MATCHING } from "../constants/enums";
import { appError } from "../utils/appError";
import { haversineKm } from "../utils/haversine";
import { isLocationFresh } from "../utils/locationFreshness";
import { workerHasCategorySkill } from "../utils/skillMatch";
import { logger } from "../utils/logger";
import {
  REDISPATCH_BLOCKING_DISPATCH_STATUSES,
  SCHEDULED_JOB_ACTIVATION_LEAD_MS,
  WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES,
  isWorkerActiveJobConstraintError,
  shouldActivateScheduledJob,
} from "./jobLifecycle";
import {
  applyFairnessSlot,
  rankRecommendationCandidates,
  RELIABILITY_CANCEL_CAP,
  type RecommendationCandidate,
} from "./recommendationEngine";
import * as notifyService from "./notifyService";

type WorkerRow = {
  id: string;
  current_lat: number | null;
  current_lng: number | null;
  location_at: string | null;
  rating: number | null;
  total_jobs: number | null;
  skills: string[] | null;
  is_available: boolean;
  is_verified: boolean;
};

type DispatchState = {
  round: number;
  radiusIndex: number;
  timeout?: NodeJS.Timeout;
};

type WorkerRecommendationCandidate = WorkerRow &
  RecommendationCandidate & {
    current_lat: number;
    current_lng: number;
  };

type DispatchStatsRow = {
  worker_id: string;
  status: string | null;
};

const RESPONSIVE_DISPATCH_STATUSES = new Set<string>(["accepted", "declined", "seen"]);

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

async function fetchJob(jobId: string) {
  const { data, error } = await supabaseAdmin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  return data;
}

async function fetchCategoryLabel(categoryId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("categories").select("name, slug").eq("id", categoryId).maybeSingle();
  return (data?.slug ?? data?.name ?? "").toLowerCase();
}

async function fetchCandidateWorkers(
  job: { location_lat: number; location_lng: number; category_id: string },
  excludeIds: Set<string>,
  radiusKm: number,
): Promise<WorkerRow[]> {
  const categoryKey = await fetchCategoryLabel(job.category_id);
  const occupiedWorkerIds = await fetchWorkerIdsWithBlockingAssignments();

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id, current_lat, current_lng, location_at, rating, total_jobs, skills, is_available, is_verified")
    .eq("is_available", true);

  if (error) throw appError(500, error.message, "WORKERS_FETCH_FAILED");

  return (data ?? []).filter((worker) => {
    if (excludeIds.has(worker.id)) return false;
    if (occupiedWorkerIds.has(worker.id)) return false;
    if (worker.current_lat == null || worker.current_lng == null) return false;
    if (!isLocationFresh(worker.location_at)) return false;
    if (categoryKey && !workerHasCategorySkill(worker.skills, categoryKey)) {
      return false;
    }
    const distance = haversineKm(job.location_lat, job.location_lng, worker.current_lat, worker.current_lng);
    return distance <= radiusKm;
  }) as WorkerRow[];
}

async function fetchWorkerIdsWithBlockingAssignments(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("worker_id")
    .not("worker_id", "is", null)
    .in("status", [...WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES]);

  if (error) {
    logger(`worker assignment occupancy warning: ${error.message}`);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.worker_id as string).filter(Boolean));
}

async function rankWorkers(
  workers: WorkerRow[],
  job: { location_lat: number; location_lng: number },
  limit: number,
): Promise<WorkerRow[]> {
  const workerIds = workers.map((worker) => worker.id);
  const [responseRates, reliabilities] = await Promise.all([
    fetchWorkerResponseRates(workerIds),
    fetchWorkerReliability(workerIds),
  ]);
  const candidates: WorkerRecommendationCandidate[] = workers.map((worker) => ({
    ...worker,
    current_lat: worker.current_lat!,
    current_lng: worker.current_lng!,
    responseRate: responseRates.get(worker.id) ?? 0,
    reliability: reliabilities.get(worker.id) ?? 1,
  }));

  const ranked = rankRecommendationCandidates(candidates, job);
  return applyFairnessSlot(ranked, limit);
}

/**
 * Reliability = 1 - min(recentCancels / cap, 1), where "recent" means the
 * worker's 30-day rolling cancel window is still current.
 */
async function fetchWorkerReliability(workerIds: string[]): Promise<Map<string, number>> {
  if (workerIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, worker_cancel_count, worker_cancel_reset_at")
    .in("id", workerIds);

  if (error) {
    logger(`worker reliability warning: ${error.message}`);
    return new Map();
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return new Map(
    (data ?? []).map((row) => {
      const resetAt = row.worker_cancel_reset_at ? new Date(row.worker_cancel_reset_at).getTime() : 0;
      const recentCancels = resetAt >= thirtyDaysAgo ? Number(row.worker_cancel_count ?? 0) : 0;
      return [row.id as string, 1 - Math.min(recentCancels / RELIABILITY_CANCEL_CAP, 1)];
    }),
  );
}

async function fetchWorkerResponseRates(workerIds: string[]): Promise<Map<string, number>> {
  if (workerIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("job_dispatches")
    .select("worker_id, status")
    .in("worker_id", workerIds);

  if (error) {
    logger(`dispatch response-rate warning: ${error.message}`);
    return new Map();
  }

  const stats = new Map<string, { received: number; responded: number }>();
  for (const row of (data ?? []) as DispatchStatsRow[]) {
    const current = stats.get(row.worker_id) ?? { received: 0, responded: 0 };
    current.received += 1;
    if (row.status && RESPONSIVE_DISPATCH_STATUSES.has(row.status)) {
      current.responded += 1;
    }
    stats.set(row.worker_id, current);
  }

  return new Map(
    [...stats.entries()].map(([workerId, value]) => [
      workerId,
      value.received === 0 ? 0 : value.responded / value.received,
    ]),
  );
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
  // Scheduled jobs are not driven by the ASAP round engine unless they were
  // reopened at activation time (worker unavailable at the slot).
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
      await fetchCandidateWorkers(job, exclude, radiusKm),
      job,
      MATCHING.WORKERS_PER_ROUND,
    );
    if (batch.length === 0) {
      state.radiusIndex += 1;
    }
  }

  if (batch.length === 0) {
    if (round >= MATCHING.MAX_ROUNDS) {
      // Scheduled jobs are never expired by round exhaustion — their
      // expires_at (slot + buffer) cron is the only expiry authority.
      if (job.job_mode !== "scheduled") await expireJob(jobId);
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
    if (job.job_mode !== "scheduled") await expireJob(jobId);
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
    if (state.round >= MATCHING.MAX_ROUNDS) {
      if (job.job_mode !== "scheduled") await expireJob(jobId);
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
    // Scheduled jobs wait for their activation window; the activation cron
    // drives their dispatch, and expires_at drives their expiry.
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
      await expireJob(job.id);
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

  // Legacy rows: scheduled jobs created as draft before jobs became visible
  // at creation. Promote them to searching so they enter the normal flow.
  await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.SEARCHING, updated_at: now.toISOString() })
    .eq("status", JOB_STATUS.DRAFT)
    .eq("job_mode", "scheduled");

  // 1. Confirmed scheduled jobs whose slot is near: promote to matched so the
  // normal on_the_way → in_progress flow takes over.
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

    // Worker is still busy on another active job. Retry every tick across
    // the lead window; once the slot itself has passed, release the job so
    // the client can still be served by someone else.
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

  // 2. Unconfirmed scheduled jobs whose slot is near: no worker accepted in
  // advance, so scramble via the round engine (its scheduled-mode guard
  // permits dispatch inside the activation window).
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
    // Stamp first so a slow push can't double-send on a later run.
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
      // Day-of heads-up for the confirmed worker.
      const { data: jobTitle } = await supabaseAdmin
        .from("jobs")
        .select("title")
        .eq("id", job.id)
        .maybeSingle();
      await notifyService.notifyWorkerScheduledDayOf(job.worker_id, job.id, jobTitle?.title ?? "Your scheduled job");
    } else {
      // The client deserves the reminder even while unmatched, so they know
      // to check on the job instead of being surprised at the slot.
      await notifyService.notifyScheduledReminderUnmatched(job.client_id, job.id);
    }
    logger(`Scheduled reminder sent for job ${job.id}`);
  }
}

/**
 * Per-minute cron: 2-hours-before reminder to the confirmed worker.
 * Deduped via reminder_2h_sent_at.
 */
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
