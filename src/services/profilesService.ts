import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import {
  createProfileSchema,
  updateProfileSchema,
  fcmTokenSchema,
} from "../validators/profiles.validator";

export async function createProfile(userId: string, body: unknown) {
  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid profile", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    full_name: input.full_name,
    phone: input.phone,
    role: input.role,
    avatar_url: input.avatar_url ?? null,
    bio: input.bio ?? null,
    location_label: input.location_label ?? null,
  });

  if (profileError) {
    if (profileError.code === "23505") {
      throw appError(409, "Profile already exists", "PROFILE_EXISTS");
    }
    throw appError(500, profileError.message, "PROFILE_CREATE_FAILED");
  }

  if (input.role === "worker") {
    const { error: workerError } = await supabaseAdmin.from("workers").insert({
      id: userId,
      skills: input.skills,
      hourly_rate: input.hourly_rate ?? null,
      rate_type: input.rate_type,
      service_areas: input.service_areas,
      experience_band: input.experience_band ?? null,
    });

    if (workerError) {
      throw appError(500, workerError.message, "WORKER_PROFILE_CREATE_FAILED");
    }
  }

  return getProfile(userId);
}

export async function getProfile(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "PROFILE_FETCH_FAILED");
  if (!profile) throw appError(404, "Profile not found", "PROFILE_NOT_FOUND");

  if (profile.role === "worker") {
    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    return { ...profile, worker: worker ?? null };
  }

  return { ...profile, worker: null };
}

export async function updateProfile(userId: string, body: unknown) {
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid update", "VALIDATION_ERROR");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "PROFILE_UPDATE_FAILED");
  return data;
}

export async function updateFcmToken(userId: string, body: unknown) {
  const parsed = fcmTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, "Invalid FCM token", "VALIDATION_ERROR");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ fcm_token: parsed.data.fcm_token })
    .eq("id", userId);

  if (error) throw appError(500, error.message, "FCM_TOKEN_UPDATE_FAILED");
  return { success: true };
}
