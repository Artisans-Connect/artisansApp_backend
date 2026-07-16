import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

export async function listNotifications(userId: string, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

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
