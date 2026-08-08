import { supabaseAdmin } from "../../config/supabase";
import { appError } from "../../utils/appError";
import { env } from "../../config/env";
import {
  updateAvailabilitySchema,
  updateWorkerProfileSchema,
} from "../../validators/workers.validator";

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

export async function setWorkerAvailabilityAfterTerminalJob(workerId: string, isAvailable: boolean) {
  await supabaseAdmin
    .from("workers")
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq("id", workerId);
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
