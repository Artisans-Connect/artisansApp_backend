import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { JOB_STATUS, CANCELLATION_STAGE } from "../constants/enums";
import { ACTIVE_WORKER_JOB_STATUSES } from "./jobLifecycle";
import { haversineKm } from "../utils/haversine";
import { appError } from "../utils/appError";
import { workerHasCategorySkill } from "../utils/skillMatch";
import {
  nearbyWorkersSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  updateWorkerProfileSchema,
} from "../validators/workers.validator";
import * as matchingService from "./matchingService";
import * as notifyService from "./notifyService";
import * as applicationsService from "./applicationsService";

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

export async function updateLocation(userId: string, body: unknown) {
  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid location payload", "VALIDATION_ERROR");
  }

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update({
      current_lat: parsed.data.current_lat,
      current_lng: parsed.data.current_lng,
      location_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "LOCATION_UPDATE_FAILED");
  return data;
}

export async function updateAvailability(userId: string, body: unknown) {
  const parsed = updateAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid availability payload", "VALIDATION_ERROR");
  }

  const patch: Record<string, unknown> = { is_available: parsed.data.is_available };
  if (!parsed.data.is_available) {
    patch.location_at = null;
  }

  const { data, error } = await supabaseAdmin.from("workers").update(patch).eq("id", userId).select().single();
  if (error) throw appError(500, error.message, "AVAILABILITY_UPDATE_FAILED");
  return data;
}

export async function getAvailability(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("is_available")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "AVAILABILITY_FETCH_FAILED");
  if (!data) throw appError(404, "Worker profile not found", "WORKER_NOT_FOUND");
  return { is_available: data.is_available === true };
}

export async function getNearby(query: unknown) {
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

export async function acceptJob(userId: string, jobId: string) {
  return applicationsService.applyToJob(userId, jobId);
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

export async function updateWorkerProfile(userId: string, body: unknown) {
  const parsed = updateWorkerProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid worker profile", "VALIDATION_ERROR");
  }

  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update(patch)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "WORKER_PROFILE_UPDATE_FAILED");
  return data;
}

export async function getActiveJob(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at)")
    .eq("worker_id", userId)
    .in("status", ACTIVE_WORKER_JOB_STATUSES)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (error) throw appError(500, error.message, "ACTIVE_JOB_FETCH_FAILED");
  return data;
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
  const data = await transitionAssignedJob(
    userId,
    jobId,
    [JOB_STATUS.MATCHED],
    JOB_STATUS.ON_THE_WAY,
    "Job can only be marked on the way after it is accepted",
  );
  await notifyService.notifyWorkerOnTheWay(data.client_id);
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
  await notifyService.notifyWorkerArrived(data.client_id);
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

  await notifyService.notifyJobStarted(data.client_id);
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
    .in("status", ACTIVE_WORKER_JOB_STATUSES)
    .select("*, client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), categories(name, icon_name, color_hex)")
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_CANCEL_FAILED");
  if (!data) throw appError(409, "Only your active assigned jobs can be cancelled", "INVALID_JOB_STATE");

  // Reset worker's application status to withdrawn so it is no longer shown as active/accepted on their end
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

export async function getHistory(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, budget_fixed, budget_min, budget_max, budget_type, address_label, location_lat, location_lng, updated_at, cancelled_by, cancelled_reason, cancelled_at, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url, phone), completion_details:job_completion_details(hours_spent, materials_used, notes, photo_urls, created_at)",
    )
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED])
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "HISTORY_FETCH_FAILED");
  return data ?? [];
}

export async function getJobRequests(userId: string) {
  await matchingService.expireTimedOutDispatches();

  // 1. Fetch worker profile for filtering
  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("current_lat, current_lng, skills")
    .eq("id", userId)
    .maybeSingle();

  // 2. Fetch jobs explicitly dispatched to this worker
  const { data: dispatches, error: dispatchError } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id")
    .eq("worker_id", userId)
    .in("status", ["sent", "seen"]);

  if (dispatchError) throw appError(500, dispatchError.message, "DISPATCH_FETCH_FAILED");

  const dispatchedJobIds = new Set((dispatches ?? []).map((d) => d.job_id));

  // 3. Fetch all open jobs that are searching/matching
  const { data: openJobs, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, budget_min, budget_max, budget_fixed, budget_type, address_label, location_lat, location_lng, created_at, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url)",
    )
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  if (!openJobs) return [];

  // 4. Filter jobs
  const finalJobs = openJobs.filter((job) => {
    // Always include explicitly dispatched jobs
    if (dispatchedJobIds.has(job.id)) return true;

    // For other jobs, require worker profile coords
    if (!worker?.current_lat || !worker?.current_lng) return false;

    // Check distance (25km max radius for open board)
    const distance = haversineKm(
      job.location_lat,
      job.location_lng,
      worker.current_lat,
      worker.current_lng,
    );
    if (distance > 25) return false;

    // Check skills
    const categoryObj = job.categories as { name?: string } | null;
    const categoryKey = categoryObj?.name;
    if (categoryKey && !workerHasCategorySkill(worker.skills, categoryKey)) {
      return false;
    }

    return true;
  });

  return finalJobs;
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
      "id, title, description, status, budget_min, budget_max, budget_fixed, budget_type, address_label, location_lat, location_lng, created_at, photo_urls, categories(name, icon_name, color_hex), client:profiles!jobs_client_id_fkey(full_name, avatar_url)",
    )
    .eq("id", jobId)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  if (!data) throw appError(409, "Job is no longer available", "JOB_NOT_AVAILABLE");
  return data;
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

export async function verifyMeForDemo(userId: string) {
  if (env.NODE_ENV === "production") {
    throw appError(403, "Demo verification is disabled in production", "FORBIDDEN");
  }

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update({ is_verified: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "WORKER_VERIFY_FAILED");
  return data;
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
