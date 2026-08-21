import { supabaseAdmin } from "../../config/supabase";
import { appError } from "../../utils/appError";
import { env } from "../../config/env";
import { JOB_STATUS } from "../../constants/enums";
import { haversineKm } from "../../utils/haversine";
import { workerHasCategorySkill } from "../../utils/skillMatch";
import { nearbyWorkersSchema } from "../../validators/workers.validator";
import * as matchingService from "../matchingService";
import { quotePreviewForWorker } from "../workerQuoteService";
import { fetchBlockedCounterpartIds } from "../blocksService";

type WorkerStatsReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type NearbyWorker = {
  id: string;
  current_lat?: number | null;
  current_lng?: number | null;
  location_at?: string | null;
  rating?: number | null;
  total_jobs?: number | null;
  hourly_rate?: number | null;
  is_available?: boolean | null;
  is_verified?: boolean | null;
  skills?: string[] | null;
  service_areas?: unknown;
  distance_km?: number | null;
  profiles?: unknown;
};

export async function getNearby(query: unknown, viewerId?: string) {
  const parsed = nearbyWorkersSchema.safeParse(query);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid nearby query", "VALIDATION_ERROR");
  }

  const { category_id, lat, lng, radius_km, limit } = parsed.data;
  const hasProximity = lat !== undefined && lng !== undefined;

  let categoryKey = "";
  if (category_id) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      category_id,
    );
    const categoryQuery = supabaseAdmin.from("categories").select("name, slug");
    const { data: category } = await (isUuid
      ? categoryQuery.eq("id", category_id)
      : categoryQuery.eq("slug", category_id)
    ).maybeSingle();
    categoryKey = (category?.slug ?? category?.name ?? category_id).toLowerCase();
  }

  let workersQuery = supabaseAdmin
    .from("workers")
    .select(
      "id, current_lat, current_lng, location_at, rating, total_jobs, hourly_rate, is_available, is_verified, skills, service_areas, profiles!workers_id_fkey(full_name, avatar_url, phone, bio, location_label)",
    );

  if (env.NODE_ENV !== "development") {
    workersQuery = workersQuery.order("is_verified", { ascending: false });
  }

  const { data: workers, error } = await workersQuery;

  if (error) throw appError(500, error.message, "NEARBY_FETCH_FAILED");

  let result: NearbyWorker[] = (workers ?? []) as NearbyWorker[];

  // Mutual invisibility: hide workers the viewer has blocked or who have blocked
  // the viewer from discovery. Fail-safe (empty set on error) inside the helper.
  if (viewerId) {
    const blocked = await fetchBlockedCounterpartIds(viewerId);
    if (blocked.size > 0) {
      result = result.filter((w) => !blocked.has(w.id));
    }
  }

  if (categoryKey) {
    result = result.filter((w) => workerHasCategorySkill(w.skills, categoryKey));
  }

  if (hasProximity) {
    const withDistance = result.map((worker) => {
      const workerLat = Number(worker.current_lat);
      const workerLng = Number(worker.current_lng);
      const hasWorkerCoords = Number.isFinite(workerLat) && Number.isFinite(workerLng);
      return {
        ...worker,
        distance_km: hasWorkerCoords ? haversineKm(lat, lng, workerLat, workerLng) : null,
      };
    });
    const withinRadius = withDistance.filter(
      (worker) => typeof worker.distance_km === "number" && worker.distance_km <= radius_km,
    );
    result = (withinRadius.length > 0 ? withinRadius : withDistance).sort((a, b) =>
      compareDiscoveryWorkers(a, b, radius_km),
    );
  } else {
    result = result.sort(compareWorkersWithoutDistance);
  }

  return result.slice(0, limit);
}

export async function getHistory(userId: string, limit?: number, offset?: number) {
  let query = supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, job_mode, budget_fixed, budget_min, budget_max, budget_type, address_label, location_lat, location_lng, updated_at, cancelled_by, cancelled_reason, cancelled_at, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at, base_rate, distance_cost, urgency_premium, gross_amount, platform_fee, artisan_payout)",
    )
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED])
    .order("updated_at", { ascending: false });

  if (limit !== undefined && offset !== undefined) {
    query = query.range(offset, offset + limit - 1);
  } else if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw appError(500, error.message, "HISTORY_FETCH_FAILED");
  return data ?? [];
}

export async function getJobRequests(userId: string) {
  await matchingService.expireTimedOutDispatches();

  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("current_lat, current_lng, skills")
    .eq("id", userId)
    .maybeSingle();

  const { data: dispatches, error: dispatchError } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id")
    .eq("worker_id", userId)
    .in("status", ["sent", "seen"]);

  if (dispatchError) throw appError(500, dispatchError.message, "DISPATCH_FETCH_FAILED");

  const dispatchedJobIds = new Set((dispatches ?? []).map((d) => d.job_id));

  const { data: openJobs, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, category_id, job_mode, budget_min, budget_max, budget_fixed, budget_type, address_label, location_lat, location_lng, created_at, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url)",
    )
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  if (!openJobs) return [];

  const finalJobs = openJobs.filter((job) => {
    if (dispatchedJobIds.has(job.id)) return true;
    if (!worker?.current_lat || !worker?.current_lng) return false;
    const distance = haversineKm(
      job.location_lat,
      job.location_lng,
      worker.current_lat,
      worker.current_lng,
    );
    if (distance > 25) return false;
    const categoryObj = job.categories as { name?: string } | null;
    const categoryKey = categoryObj?.name;
    if (categoryKey && !workerHasCategorySkill(worker.skills, categoryKey)) {
      return false;
    }
    return true;
  });

  return Promise.all(finalJobs.map((job) => enrichJobWithWorkerQuote(job, userId)));
}

export async function getStats(userId: string) {
  const { data: worker, error: workerError } = await supabaseAdmin
    .from("workers")
    .select("id, rating, total_jobs")
    .eq("id", userId)
    .maybeSingle();

  if (workerError) throw appError(500, workerError.message, "WORKER_STATS_FETCH_FAILED");
  if (!worker) throw appError(404, "Worker profile not found", "WORKER_NOT_FOUND");

  const { count: completedJobs, error: completedError } = await supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", userId)
    .eq("status", JOB_STATUS.COMPLETED);

  if (completedError) throw appError(500, completedError.message, "WORKER_STATS_FETCH_FAILED");

  const { count: reviewCount, error: reviewCountError } = await supabaseAdmin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("worker_id", userId);

  if (reviewCountError) throw appError(500, reviewCountError.message, "WORKER_STATS_FETCH_FAILED");

  const { data: reviews, error: reviewsError } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)")
    .eq("worker_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (reviewsError) throw appError(500, reviewsError.message, "WORKER_STATS_FETCH_FAILED");

  const { data: acceptedDispatches, error: dispatchError } = await supabaseAdmin
    .from("job_dispatches")
    .select("created_at, responded_at")
    .eq("worker_id", userId)
    .eq("status", "accepted")
    .not("responded_at", "is", null)
    .order("responded_at", { ascending: false })
    .limit(25);

  if (dispatchError) throw appError(500, dispatchError.message, "WORKER_STATS_FETCH_FAILED");

  const responseStats = responseTimeStats(acceptedDispatches ?? []);

  return {
    total_jobs: completedJobs ?? worker.total_jobs ?? 0,
    rating: Number(worker.rating ?? 0),
    review_count: reviewCount ?? 0,
    response_hours_label: responseStats.label,
    response_minutes_average: responseStats.averageMinutes,
    response_sample_count: responseStats.sampleCount,
    recent_reviews: ((reviews ?? []) as WorkerStatsReview[]).map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at,
      reviewer_name: review.reviewer?.full_name ?? "Client",
      reviewer_avatar_url: review.reviewer?.avatar_url ?? null,
    })),
  };
}

export async function getJobRequestById(userId: string, jobId: string) {
  await matchingService.expireTimedOutDispatches(jobId);

  const { data: dispatch } = await supabaseAdmin
    .from("job_dispatches")
    .update({ status: "seen" })
    .eq("job_id", jobId)
    .eq("worker_id", userId)
    .eq("status", "sent")
    .select("job_id")
    .maybeSingle();

  if (!dispatch) {
    const { data: existingDispatch } = await supabaseAdmin
      .from("job_dispatches")
      .select("job_id")
      .eq("job_id", jobId)
      .eq("worker_id", userId)
      .in("status", ["seen", "sent"])
      .maybeSingle();
    if (!existingDispatch) throw appError(404, "Job request not found", "JOB_REQUEST_NOT_FOUND");
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, category_id, job_mode, budget_min, budget_max, budget_fixed, budget_type, address_label, location_lat, location_lng, created_at, photo_urls, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url)",
    )
    .eq("id", jobId)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  if (!data) throw appError(409, "Job is no longer available", "JOB_NOT_AVAILABLE");
  return enrichJobWithWorkerQuote(data, userId);
}

async function enrichJobWithWorkerQuote<T extends { id: string; category_id?: string | null }>(
  job: T,
  workerId: string,
) {
  const quoteJob = {
    id: job.id,
    category_id: job.category_id ?? "",
    location_lat: (job as { location_lat?: number | null }).location_lat ?? null,
    location_lng: (job as { location_lng?: number | null }).location_lng ?? null,
    job_mode: (job as { job_mode?: string | null }).job_mode ?? null,
  };
  if (!quoteJob.category_id) return job;
  const quote = await quotePreviewForWorker(quoteJob, workerId);
  return quote ? { ...job, application_quote: quote } : job;
}

function responseTimeStats(dispatches: Array<{ created_at: string | null; responded_at: string | null }>) {
  if (dispatches.length === 0) {
    return { label: "--", averageMinutes: null, sampleCount: 0 };
  }

  const minuteValues = dispatches
    .map((dispatch) => {
      const sentAt = dispatch.created_at ? Date.parse(dispatch.created_at) : NaN;
      const respondedAt = dispatch.responded_at ? Date.parse(dispatch.responded_at) : NaN;
      if (!Number.isFinite(sentAt) || !Number.isFinite(respondedAt)) return null;
      return Math.max(0, (respondedAt - sentAt) / (1000 * 60));
    })
    .filter((value): value is number => value != null);

  if (minuteValues.length === 0) {
    return { label: "--", averageMinutes: null, sampleCount: 0 };
  }

  const average = minuteValues.reduce((sum, value) => sum + value, 0) / minuteValues.length;
  if (average < 1) {
    return { label: "<1 min", averageMinutes: average, sampleCount: minuteValues.length };
  }
  if (average < 60) {
    return { label: `${Math.round(average)} min`, averageMinutes: average, sampleCount: minuteValues.length };
  }
  return {
    label: `${(average / 60).toFixed(1)} hrs`,
    averageMinutes: average,
    sampleCount: minuteValues.length,
  };
}

function scoreNearbyWorker(worker: NearbyWorker, radiusKm: number): number {
  const distance = typeof worker.distance_km === "number" ? worker.distance_km : radiusKm;
  const proximityScore = Math.max(0, 1 - distance / Math.max(radiusKm, 1));
  const ratingScore = Math.max(0, Math.min(Number(worker.rating ?? 0) / 5, 1));
  const verificationScore = worker.is_verified ? 1 : 0;
  const availabilityScore = worker.is_available ? 1 : 0;
  return proximityScore * 0.45 + verificationScore * 0.25 + ratingScore * 0.2 + availabilityScore * 0.1;
}

function compareDiscoveryWorkers(a: NearbyWorker, b: NearbyWorker, radiusKm: number): number {
  const scoreDelta = scoreNearbyWorker(b, radiusKm) - scoreNearbyWorker(a, radiusKm);
  if (scoreDelta !== 0) return scoreDelta;
  return compareWorkersWithoutDistance(a, b);
}

function compareWorkersWithoutDistance(a: NearbyWorker, b: NearbyWorker): number {
  return (
    Number(b.is_verified) - Number(a.is_verified) ||
    Number(b.is_available) - Number(a.is_available) ||
    Number(b.rating ?? 0) - Number(a.rating ?? 0) ||
    Number(b.total_jobs ?? 0) - Number(a.total_jobs ?? 0)
  );
}

export async function getWorkerEarnings(userId: string) {
  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select("id, title, updated_at, completion_details:job_completion_details(artisan_payout, gross_amount, platform_fee)")
    .eq("worker_id", userId)
    .eq("status", "completed")
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "EARNINGS_FETCH_FAILED");

  let totalEarned = 0;
  const history = (jobs ?? []).map((job) => {
    const details = Array.isArray(job.completion_details)
      ? job.completion_details[0]
      : job.completion_details;

    const payout = details?.artisan_payout ? Number(details.artisan_payout) : 0;
    const gross = details?.gross_amount ? Number(details.gross_amount) : 0;
    const fee = details?.platform_fee ? Number(details.platform_fee) : 0;

    totalEarned += payout;

    return {
      job_id: job.id,
      title: job.title,
      completed_at: job.updated_at,
      gross_amount: gross,
      platform_fee: fee,
      artisan_payout: payout,
    };
  });

  return {
    total_earned: Math.round(totalEarned * 100) / 100,
    history,
  };
}
