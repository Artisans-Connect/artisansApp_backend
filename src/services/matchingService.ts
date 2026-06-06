import { supabaseAdmin } from "../config/supabase";
import { JOB_STATUS, MATCHING } from "../constants/enums";
import { appError } from "../utils/appError";
import { haversineKm } from "../utils/haversine";
import { isLocationFresh } from "../utils/locationFreshness";
import { workerHasCategorySkill } from "../utils/skillMatch";
import { logger } from "../utils/logger";
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

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id, current_lat, current_lng, location_at, rating, total_jobs, skills, is_available, is_verified")
    .eq("is_available", true);

  if (error) throw appError(500, error.message, "WORKERS_FETCH_FAILED");

  return (data ?? []).filter((worker) => {
    if (excludeIds.has(worker.id)) return false;
    if (worker.current_lat == null || worker.current_lng == null) return false;
    if (!isLocationFresh(worker.location_at)) return false;
    if (categoryKey && !workerHasCategorySkill(worker.skills, categoryKey)) {
      return false;
    }
    const distance = haversineKm(job.location_lat, job.location_lng, worker.current_lat, worker.current_lng);
    return distance <= radiusKm;
  }) as WorkerRow[];
}

function rankWorkers(
  workers: WorkerRow[],
  job: { location_lat: number; location_lng: number },
  radiusKm: number,
): WorkerRow[] {
  return [...workers].sort((a, b) => {
    return scoreWorker(b, job, radiusKm) - scoreWorker(a, job, radiusKm);
  });
}

function scoreWorker(
  worker: WorkerRow,
  job: { location_lat: number; location_lng: number },
  radiusKm: number,
): number {
  const distanceKm = haversineKm(job.location_lat, job.location_lng, worker.current_lat!, worker.current_lng!);
  const proximityScore = Math.max(0, 1 - distanceKm / Math.max(radiusKm, 1));
  const ratingScore = Math.max(0, Math.min(Number(worker.rating ?? 0) / 5, 1));
  const verificationScore = worker.is_verified ? 1 : 0;
  const freshnessScore = locationFreshnessScore(worker.location_at);
  const jobsScore = Math.max(0, Math.min(Number(worker.total_jobs ?? 0) / 50, 1));

  return (
    proximityScore * 0.4 +
    ratingScore * 0.25 +
    verificationScore * 0.2 +
    freshnessScore * 0.1 +
    jobsScore * 0.05
  );
}

function locationFreshnessScore(locationAt: string | null): number {
  if (!locationAt) return 0;
  const ageMinutes = (Date.now() - new Date(locationAt).getTime()) / (1000 * 60);
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return 0.5;
  if (ageMinutes <= 5) return 1;
  if (ageMinutes <= 15) return 0.75;
  if (ageMinutes <= 30) return 0.5;
  return 0.25;
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
  }));
  const { error } = await supabaseAdmin.from("job_dispatches").upsert(rows, {
    onConflict: "job_id,worker_id,round",
    ignoreDuplicates: true,
  });
  if (error) logger(`job_dispatches insert warning: ${error.message}`);
}

export async function dispatchToWorker(
  jobId: string,
  workerId: string,
  round = 1,
  radiusKm = 0,
): Promise<void> {
  const now = new Date();
  const { error } = await supabaseAdmin.from("job_dispatches").upsert(
    {
      job_id: jobId,
      worker_id: workerId,
      round,
      radius_km: radiusKm,
      status: "sent",
      expires_at: new Date(now.getTime() + MATCHING.ROUND_TIMEOUT_MS).toISOString(),
      notified_at: now.toISOString(),
    },
    {
      onConflict: "job_id,worker_id,round",
      ignoreDuplicates: true,
    },
  );
  if (error) logger(`targeted job_dispatch insert warning: ${error.message}`);
}

async function getDispatchedWorkerIds(jobId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("job_dispatches").select("worker_id").eq("job_id", jobId);
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
  await notifyService.notifyJobExpired(job.client_id);
}

export async function findAndDispatch(jobId: string, round = 1): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) return;

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
    const candidates = rankWorkers(await fetchCandidateWorkers(job, exclude, radiusKm), job, radiusKm);
    batch = candidates.slice(0, MATCHING.WORKERS_PER_ROUND);
    if (batch.length === 0) {
      state.radiusIndex += 1;
    }
  }

  if (batch.length === 0) {
    if (round >= MATCHING.MAX_ROUNDS) {
      await expireJob(jobId);
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
    await expireJob(jobId);
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
      await expireJob(jobId);
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
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING]);

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
    .in("status", [JOB_STATUS.DRAFT, JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING, JOB_STATUS.MATCHED, JOB_STATUS.IN_PROGRESS]);

  for (const job of jobs ?? []) {
    if (!job.worker_id) continue;
    const { data: workerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", job.worker_id)
      .maybeSingle();
    await notifyService.notifyScheduledReminder(job.client_id, workerProfile?.full_name ?? "your artisan");
    logger(`Scheduled reminder sent for job ${job.id}`);
  }
}
