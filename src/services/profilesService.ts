import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import {
  createProfileSchema,
  updateProfileSchema,
  fcmTokenSchema,
  updateModeSchema,
  onboardWorkerSchema,
} from "../validators/profiles.validator";

export async function createProfile(userId: string, body: unknown) {
  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid profile", "VALIDATION_ERROR");
  }

  const input = parsed.data;
  const initialMode = input.signup_type;

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    full_name: input.full_name,
    phone: input.phone,
    signup_type: input.signup_type,
    last_active_mode: initialMode,
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

  if (input.signup_type === "worker") {
    const { error: workerError } = await supabaseAdmin.from("workers").insert({
      id: userId,
      skills: input.skills,
      hourly_rate: input.hourly_rate ?? null,
      rate_type: input.rate_type,
      service_areas: input.service_areas,
      experience_band: input.experience_band ?? null,
    });

    if (workerError) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
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

  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const { data: verification } = worker
    ? await supabaseAdmin
        .from("worker_verifications")
        .select("status, verification_level, application_number")
        .eq("worker_id", userId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return {
    ...profile,
    verification_status: verification?.status ?? null,
    verification_level: verification?.verification_level ?? null,
    verification_application_number: verification?.application_number ?? null,
    worker: worker ?? null,
    has_worker_profile: worker != null,
  };
}

export async function updateActiveMode(userId: string, body: unknown) {
  const parsed = updateModeSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid mode", "VALIDATION_ERROR");
  }

  const { mode } = parsed.data;

  if (mode === "worker") {
    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!worker) {
      throw appError(403, "You don't have a worker profile", "NO_WORKER_PROFILE");
    }
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ last_active_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "MODE_UPDATE_FAILED");
  return getProfile(userId);
}

export async function onboardWorker(userId: string, body: unknown) {
  const parsed = onboardWorkerSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid worker onboarding", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  const { data: existingWorker } = await supabaseAdmin
    .from("workers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingWorker) {
    throw appError(409, "Worker profile already exists", "WORKER_PROFILE_EXISTS");
  }

  const { error: workerError } = await supabaseAdmin.from("workers").insert({
    id: userId,
    skills: input.skills,
    service_areas: input.service_areas,
    experience_band: input.experience_band ?? null,
  });

  if (workerError) {
    throw appError(500, workerError.message, "WORKER_PROFILE_CREATE_FAILED");
  }

  const profilePatch: Record<string, unknown> = {
    last_active_mode: "worker",
    updated_at: new Date().toISOString(),
  };
  if (input.bio !== undefined) profilePatch.bio = input.bio;
  if (input.avatar_url !== undefined) profilePatch.avatar_url = input.avatar_url;
  if (input.location_label !== undefined) profilePatch.location_label = input.location_label;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update(profilePatch)
    .eq("id", userId);

  if (profileError) {
    await supabaseAdmin.from("workers").delete().eq("id", userId);
    throw appError(500, profileError.message, "PROFILE_UPDATE_FAILED");
  }

  return getProfile(userId);
}

export async function updateProfile(userId: string, body: unknown) {
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid update", "VALIDATION_ERROR");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw appError(500, error.message, "PROFILE_UPDATE_FAILED");
  return getProfile(userId);
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
