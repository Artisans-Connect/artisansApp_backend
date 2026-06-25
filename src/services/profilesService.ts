import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { createHash } from "crypto";
import {
  createProfileSchema,
  updateProfileSchema,
  fcmTokenSchema,
  notificationDeviceSchema,
  updateModeSchema,
  onboardWorkerSchema,
} from "../validators/profiles.validator";

export function hashFcmToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

  // Auto-sync Google/Auth Sign-in metadata if fields are empty
  const hasMissingName = !profile.full_name || profile.full_name.trim() === "";
  const hasMissingAvatar = !profile.avatar_url;
  const hasMissingPhone = !profile.phone;

  if (hasMissingName || hasMissingAvatar || hasMissingPhone) {
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!authError && authData?.user) {
        const metadata = authData.user.user_metadata || {};
        const nameFromMeta = metadata.full_name || metadata.name || "";
        const avatarFromMeta = metadata.avatar_url || metadata.picture || "";
        const phoneFromMeta = authData.user.phone || metadata.phone || "";

        const updates: Record<string, any> = {};
        if (hasMissingName && nameFromMeta) {
          updates.full_name = nameFromMeta;
          profile.full_name = nameFromMeta;
        }
        if (hasMissingAvatar && avatarFromMeta) {
          updates.avatar_url = avatarFromMeta;
          profile.avatar_url = avatarFromMeta;
        }
        if (hasMissingPhone && phoneFromMeta) {
          updates.phone = phoneFromMeta;
          profile.phone = phoneFromMeta;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("profiles")
            .update(updates)
            .eq("id", userId);
        }
      }
    } catch (e) {
      console.error("Error auto-syncing auth metadata:", e);
    }
  }

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

  // Fetch completed job photos and custom portfolio photos for the gallery
  const { data: completions } = await supabaseAdmin
    .from("job_completion_details")
    .select("photo_urls, jobs(status)")
    .eq("worker_id", userId);

  const jobImages: string[] = [];
  if (completions) {
    for (const comp of completions) {
      const job = Array.isArray(comp.jobs) ? comp.jobs[0] : comp.jobs;
      const status = job?.status;
      if (comp.photo_urls && Array.isArray(comp.photo_urls)) {
        if (!job || status === "completed" || status === "pending_client_approval") {
          jobImages.push(...comp.photo_urls);
        }
      }
    }
  }

  return {
    ...profile,
    verification_status: verification?.status ?? null,
    verification_level: verification?.verification_level ?? null,
    verification_application_number: verification?.application_number ?? null,
    worker: worker ?? null,
    has_worker_profile: worker != null,
    job_images: jobImages,
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

export async function registerNotificationDevice(userId: string, body: unknown) {
  const parsed = notificationDeviceSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid notification device", "VALIDATION_ERROR");
  }

  const input = parsed.data;
  const tokenHash = hashFcmToken(input.fcm_token);

  const { data, error } = await supabaseAdmin
    .from("notification_devices")
    .upsert(
      {
        user_id: userId,
        token_hash: tokenHash,
        fcm_token: input.fcm_token,
        platform: input.platform,
        app_version: input.app_version ?? null,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token_hash" },
    )
    .select("id, token_hash, platform, app_version, last_seen_at")
    .single();

  if (error) throw appError(500, error.message, "NOTIFICATION_DEVICE_REGISTER_FAILED");

  await supabaseAdmin.from("profiles").update({ fcm_token: input.fcm_token }).eq("id", userId);

  return data;
}

export async function revokeNotificationDevice(userId: string, tokenHash: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_devices")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw appError(500, error.message, "NOTIFICATION_DEVICE_REVOKE_FAILED");
  return { success: true, revoked: Boolean(data) };
}

export async function addGalleryPhoto(userId: string, url: string) {
  if (!url || typeof url !== "string") {
    throw appError(400, "Invalid photo URL", "VALIDATION_ERROR");
  }

  // Find the row where job_id is null for this worker
  const { data: existing } = await supabaseAdmin
    .from("job_completion_details")
    .select("id, photo_urls")
    .eq("worker_id", userId)
    .is("job_id", null)
    .maybeSingle();

  if (existing) {
    const urls = existing.photo_urls && Array.isArray(existing.photo_urls) ? existing.photo_urls : [];
    if (!urls.includes(url)) {
      urls.push(url);
    }
    const { error } = await supabaseAdmin
      .from("job_completion_details")
      .update({ photo_urls: urls })
      .eq("id", existing.id);
    if (error) throw appError(500, error.message, "GALLERY_UPDATE_FAILED");
  } else {
    const { error } = await supabaseAdmin
      .from("job_completion_details")
      .insert({
        worker_id: userId,
        job_id: null,
        photo_urls: [url],
      });
    if (error) throw appError(500, error.message, "GALLERY_UPDATE_FAILED");
  }

  return getProfile(userId);
}

export async function deleteGalleryPhoto(userId: string, url: string) {
  if (!url || typeof url !== "string") {
    throw appError(400, "Invalid photo URL", "VALIDATION_ERROR");
  }

  // Fetch all completion details for this worker
  const { data: rows } = await supabaseAdmin
    .from("job_completion_details")
    .select("id, photo_urls")
    .eq("worker_id", userId);

  if (rows) {
    for (const row of rows) {
      if (row.photo_urls && Array.isArray(row.photo_urls) && row.photo_urls.includes(url)) {
        const updatedUrls = row.photo_urls.filter((u) => u !== url);
        const { error } = await supabaseAdmin
          .from("job_completion_details")
          .update({ photo_urls: updatedUrls })
          .eq("id", row.id);
        if (error) throw appError(500, error.message, "GALLERY_PHOTO_DELETE_FAILED");
      }
    }
  }

  return getProfile(userId);
}

