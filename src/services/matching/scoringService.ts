import { supabaseAdmin } from "../../config/supabase";
import { appError } from "../../utils/appError";
import { haversineKm } from "../../utils/haversine";
import { isLocationFresh } from "../../utils/locationFreshness";
import { workerHasCategorySkill } from "../../utils/skillMatch";
import { logger } from "../../utils/logger";
import { WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES } from "../jobLifecycle";
import {
  applyFairnessSlot,
  rankRecommendationCandidates,
  RELIABILITY_CANCEL_CAP,
  type RecommendationCandidate,
} from "../recommendationEngine";
import { RESPONSIVE_DISPATCH_STATUSES, WorkerRow, DispatchStatsRow, WorkerRecommendationCandidate } from "./matchingTypes";

export async function fetchCategoryLabel(categoryId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("categories").select("name, slug").eq("id", categoryId).maybeSingle();
  return (data?.slug ?? data?.name ?? "").toLowerCase();
}

export async function fetchWorkerIdsWithBlockingAssignments(): Promise<Set<string>> {
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

export async function fetchCandidateWorkers(
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

export async function fetchWorkerReliability(workerIds: string[]): Promise<Map<string, number>> {
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

export async function fetchWorkerResponseRates(workerIds: string[]): Promise<Map<string, number>> {
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

export async function rankWorkers(
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
