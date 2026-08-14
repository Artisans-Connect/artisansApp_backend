import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

export async function listNotifications(userId: string, limit = 20, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw appError(500, error.message, "NOTIFICATIONS_FETCH_FAILED");
  return data ?? [];
}

export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw appError(500, error.message, "NOTIFICATIONS_UNREAD_COUNT_FAILED");
  return { unread_count: count ?? 0 };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) throw appError(500, error.message, "NOTIFICATION_READ_FAILED");
  if (!data) throw appError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  return data;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw appError(500, error.message, "NOTIFICATIONS_READ_ALL_FAILED");
  return { success: true };
}

export async function deleteNotification(userId: string, notificationId: string) {
  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) throw appError(500, error.message, "NOTIFICATION_DELETE_FAILED");
  return { success: true };
}

export async function broadcastNotification(payload: {
  target: "all" | "workers" | "clients";
  title: string;
  body: string;
  type?: string;
}) {
  if (!payload.title?.trim() || !payload.body?.trim()) {
    throw appError(400, "Title and body are required for broadcast notification", "VALIDATION_ERROR");
  }

  let query = supabaseAdmin.from("profiles").select("id, signup_type, last_active_mode");

  if (payload.target === "workers") {
    const { data: workers } = await supabaseAdmin.from("workers").select("id");
    const workerIds = (workers ?? []).map((w) => w.id);
    if (workerIds.length > 0) {
      query = query.in("id", workerIds);
    }
  }

  const { data: targetProfiles, error } = await query;
  if (error) throw appError(500, error.message, "PROFILES_FETCH_FAILED");

  const profilesToNotify = (targetProfiles ?? []).filter((p) => {
    if (payload.target === "workers") return true;
    if (payload.target === "clients") return p.last_active_mode === "client" || p.signup_type === "client";
    return true;
  });

  if (profilesToNotify.length === 0) {
    return { count: 0, target: payload.target };
  }

  const now = new Date().toISOString();
  const notificationRows = profilesToNotify.map((p) => ({
    user_id: p.id,
    title: payload.title.trim(),
    body: payload.body.trim(),
    type: payload.type || "system_announcement",
    created_at: now,
  }));

  const { error: insertError } = await supabaseAdmin
    .from("notifications")
    .insert(notificationRows);

  if (insertError) throw appError(500, insertError.message, "NOTIFICATIONS_BROADCAST_FAILED");

  return {
    count: profilesToNotify.length,
    target: payload.target,
    title: payload.title.trim(),
  };
}
