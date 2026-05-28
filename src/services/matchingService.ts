import { supabaseAdmin } from "../config/supabase";
import { JOB_STATUS, MATCHING } from "../constants/enums";
import { haversineKm } from "../utils/haversine";
import { logger } from "../utils/logger";
import * as notifyService from "./notifyService";

type WorkerRow = {
  id: string;
  current_lat: number | null;
  current_lng: number | null;
  rating: number | null;
  skills: string[] | null;
  is_available: boolean;
  is_verified: boolean;
};

type DispatchState = {
  round: number;
  dispatchedWorkerIds: Set<string>;
  declinedWorkerIds: Set<string>;
  timeout?: NodeJS.Timeout;
};

const dispatchStateByJob = new Map<string, DispatchState>();

function getState(jobId: string): DispatchState {
  let state = dispatchStateByJob.get(jobId);
  if (!state) {
    state = { round: 1, dispatchedWorkerIds: new Set(), declinedWorkerIds: new Set() };
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
  if (error) throw error;
  return data;
}

async function fetchCategoryLabel(categoryId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("categories").select("name, slug").eq("id", categoryId).maybeSingle();
  return (data?.slug ?? data?.name ?? "").toLowerCase();
}

async function fetchCandidateWorkers(
  job: { location_lat: number; location_lng: number; category_id: string },
  excludeIds: Set<string>,
): Promise<WorkerRow[]> {
  const categoryKey = await fetchCategoryLabel(job.category_id);

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id, current_lat, current_lng, rating, skills, is_available, is_verified")
    .eq("is_available", true)
    .eq("is_verified", true);

  if (error) throw error;

  return (data ?? []).filter((worker) => {
    if (excludeIds.has(worker.id)) return false;
    if (worker.current_lat == null || worker.current_lng == null) return false;
    const skills = (worker.skills ?? []).map((s: string) => s.toLowerCase());
    if (categoryKey && skills.length > 0 && !skills.some((s: string) => s.includes(categoryKey) || categoryKey.includes(s))) {
      return false;
    }
    const distance = haversineKm(job.location_lat, job.location_lng, worker.current_lat, worker.current_lng);
    return distance <= MATCHING.DEFAULT_RADIUS_KM;
  }) as WorkerRow[];
}

function rankWorkers(
  workers: WorkerRow[],
  job: { location_lat: number; location_lng: number },
): WorkerRow[] {
  return [...workers].sort((a, b) => {
    const distA = haversineKm(job.location_lat, job.location_lng, a.current_lat!, a.current_lng!);
    const distB = haversineKm(job.location_lat, job.location_lng, b.current_lat!, b.current_lng!);
    if (distA !== distB) return distA - distB;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
}

export async function expireJob(jobId: string): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if ([JOB_STATUS.MATCHED, JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED, JOB_STATUS.EXPIRED].includes(job.status)) {
    return;
  }

  await supabaseAdmin.from("jobs").update({ status: JOB_STATUS.EXPIRED }).eq("id", jobId);
  clearDispatchState(jobId);
  await notifyService.notifyJobExpired(job.client_id);
}

export async function findAndDispatch(jobId: string, round = 1): Promise<void> {
  const job = await fetchJob(jobId);
  if (!job) return;
  if (![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) return;

  const state = getState(jobId);
  state.round = round;

  const exclude = new Set([...state.dispatchedWorkerIds, ...state.declinedWorkerIds]);
  const candidates = rankWorkers(await fetchCandidateWorkers(job, exclude), job);
  const batch = candidates.slice(0, MATCHING.WORKERS_PER_ROUND);

  if (batch.length === 0) {
    if (round >= MATCHING.MAX_ROUNDS) {
      await expireJob(jobId);
    } else {
      scheduleReDispatch(jobId, round);
    }
    return;
  }

  await supabaseAdmin.from("jobs").update({ status: JOB_STATUS.MATCHING }).eq("id", jobId);

  for (const worker of batch) {
    state.dispatchedWorkerIds.add(worker.id);
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

  if (round >= MATCHING.MAX_ROUNDS) {
    await expireJob(jobId);
    return;
  }

  await findAndDispatch(jobId, round + 1);
}

export async function recordDecline(jobId: string, workerId: string): Promise<void> {
  const state = getState(jobId);
  state.declinedWorkerIds.add(workerId);

  const job = await fetchJob(jobId);
  if (!job || ![JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING].includes(job.status)) return;

  const roundDispatched = [...state.dispatchedWorkerIds];
  const allDeclined =
    roundDispatched.length > 0 && roundDispatched.every((id) => state.declinedWorkerIds.has(id));

  if (allDeclined) {
    if (state.timeout) clearTimeout(state.timeout);
    if (state.round >= MATCHING.MAX_ROUNDS) {
      await expireJob(jobId);
    } else {
      await findAndDispatch(jobId, state.round + 1);
    }
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
