import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { JOB_STATUS } from "../constants/enums";
import { haversineKm } from "../utils/haversine";
import { isLocationFresh } from "../utils/locationFreshness";
import { appError } from "../utils/appError";
import {
  nearbyWorkersSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  updateWorkerProfileSchema,
} from "../validators/workers.validator";
import * as matchingService from "./matchingService";
import * as notifyService from "./notifyService";

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

export async function getNearby(query: unknown) {
  const parsed = nearbyWorkersSchema.safeParse(query);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid nearby query", "VALIDATION_ERROR");
  }

  const { category_id, lat, lng, radius_km, limit } = parsed.data;
  const hasProximity = lat !== undefined && lng !== undefined;

  let categoryKey = "";
  if (category_id) {
    const { data: category } = await supabaseAdmin.from("categories").select("name, slug").eq("id", category_id).maybeSingle();
    categoryKey = (category?.slug ?? category?.name ?? "").toLowerCase();
  }

  let workersQuery = supabaseAdmin
    .from("workers")
    .select(
      "id, current_lat, current_lng, location_at, rating, hourly_rate, is_available, is_verified, skills, service_areas, profiles!workers_id_fkey(full_name, avatar_url)",
    );

  if (hasProximity) {
    workersQuery = workersQuery.eq("is_available", true).eq("is_verified", true);
  } else if (env.NODE_ENV !== "development") {
    workersQuery = workersQuery.eq("is_verified", true);
  }

  const { data: workers, error } = await workersQuery;

  if (error) throw appError(500, error.message, "NEARBY_FETCH_FAILED");

  let result: any[] = workers ?? [];

  if (hasProximity) {
    result = result.filter((w) => {
      if (!isLocationFresh(w.location_at)) return false;
      if (!categoryKey) return true;
      const skills = (w.skills ?? []).map((s: string) => s.toLowerCase());
      if (skills.length === 0) return false;
      return skills.some((s: string) => s.includes(categoryKey) || categoryKey.includes(s));
    });
  } else if (categoryKey) {
    result = result.filter((w) => {
      const skills = (w.skills ?? []).map((s: string) => s.toLowerCase());
      if (skills.length === 0) return false;
      return skills.some((s: string) => s.includes(categoryKey) || categoryKey.includes(s));
    });
  }

  if (hasProximity) {
    result = result
      .filter((w) => w.current_lat != null && w.current_lng != null)
      .map((w) => ({
        ...w,
        distance_km: haversineKm(lat, lng, w.current_lat!, w.current_lng!),
      }))
      .filter((w) => w.distance_km <= radius_km)
      .sort((a, b) => a.distance_km - b.distance_km || (b.rating ?? 0) - (a.rating ?? 0));
  } else {
    // If no location provided, just sort by rating (highest first)
    result = result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }

  return result.slice(0, limit);
}

export async function acceptJob(userId: string, jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.MATCHED, worker_id: userId })
    .eq("id", jobId)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .select()
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_ACCEPT_FAILED");
  if (!data) throw appError(409, "Job already taken or not available", "JOB_ALREADY_TAKEN");

  matchingService.clearDispatchState(jobId);

  const { data: workerProfile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  await notifyService.notifyJobMatched(data.client_id, workerProfile?.full_name ?? "Artisan");

  return data;
}

export async function declineJob(userId: string, jobId: string) {
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
    .select("*, profiles!jobs_client_id_fkey(full_name, avatar_url, phone)")
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.MATCHED, JOB_STATUS.IN_PROGRESS])
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (error) throw appError(500, error.message, "ACTIVE_JOB_FETCH_FAILED");
  return data;
}

export async function startJob(userId: string, jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.IN_PROGRESS, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("worker_id", userId)
    .eq("status", JOB_STATUS.MATCHED)
    .select()
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_START_FAILED");
  if (!data) {
    throw appError(409, "Job cannot be started — wrong status or not assigned to you", "INVALID_JOB_STATE");
  }

  await notifyService.notifyJobStarted(data.client_id);

  return data;
}

export async function getHistory(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, status, budget_fixed, budget_min, budget_max, address_label, updated_at, categories(name), profiles!jobs_client_id_fkey(full_name, avatar_url)",
    )
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED])
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "HISTORY_FETCH_FAILED");
  return data ?? [];
}

export async function getJobRequests(userId: string) {
  const { data: dispatches, error: dispatchError } = await supabaseAdmin
    .from("job_dispatches")
    .select("job_id")
    .eq("worker_id", userId);

  if (dispatchError) throw appError(500, dispatchError.message, "DISPATCH_FETCH_FAILED");

  const jobIds = [...new Set((dispatches ?? []).map((d) => d.job_id))];
  if (jobIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, description, status, budget_min, budget_max, address_label, location_lat, location_lng, created_at, categories(name), profiles!jobs_client_id_fkey(full_name)",
    )
    .in("id", jobIds)
    .in("status", [JOB_STATUS.SEARCHING, JOB_STATUS.MATCHING])
    .is("worker_id", null)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  return data ?? [];
}
