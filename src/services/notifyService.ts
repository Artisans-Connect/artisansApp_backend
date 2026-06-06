import { firebaseAdmin } from "../config/firebase";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function getUserFcmTokens(userId: string): Promise<string[]> {
  const { data: devices } = await supabaseAdmin
    .from("notification_devices")
    .select("fcm_token")
    .eq("user_id", userId)
    .is("revoked_at", null);

  const tokens = new Set<string>();
  for (const device of devices ?? []) {
    if (device.fcm_token) tokens.add(device.fcm_token);
  }

  const { data: profile } = await supabaseAdmin.from("profiles").select("fcm_token").eq("id", userId).maybeSingle();
  if (profile?.fcm_token) tokens.add(profile.fcm_token);

  return [...tokens];
}

async function storeNotification(userId: string, payload: PushPayload): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: payload.data?.type ?? "general",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  });
  if (error) logger(`Notification store failed: ${error.message}`);
}

export async function sendToToken(token: string, payload: PushPayload): Promise<void> {
  try {
    await firebaseAdmin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
  } catch (error) {
    logger("FCM send failed:", error);
    throw error;
  }
}

async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  await storeNotification(userId, payload);

  const tokens = await getUserFcmTokens(userId);
  if (tokens.length === 0) {
    logger(`No FCM tokens for user ${userId}`);
    return;
  }

  for (const token of tokens) {
    try {
      await sendToToken(token, payload);
    } catch {
      // Do not crash caller paths on push failure.
    }
  }
}

export async function notifyWorkerNewJob(
  workerId: string,
  job: { id: string; title: string; address_label: string },
): Promise<void> {
  await sendToUser(workerId, {
    title: "New job request",
    body: `${job.title} · ${job.address_label}`,
    data: { type: "new_job", jobId: job.id },
  });
}

export async function notifyJobMatched(clientId: string, workerName: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan matched",
    body: `${workerName} accepted your job`,
    data: { type: "job_matched" },
  });
}

export async function notifyJobStarted(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Work started",
    body: "Your artisan has started the job",
    data: { type: "job_started" },
  });
}

export async function notifyWorkerOnTheWay(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan on the way",
    body: "Your artisan is heading to your location",
    data: { type: "worker_on_the_way" },
  });
}

export async function notifyWorkerArrived(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan arrived",
    body: "Your artisan has arrived at the job location",
    data: { type: "worker_arrived" },
  });
}

export async function notifyJobExpired(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "No artisan found",
    body: "We could not find an available worker. You can try again.",
    data: { type: "job_expired" },
  });
}

export async function notifyJobCompleted(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Job completed",
    body: "Please rate your artisan",
    data: { type: "job_completed" },
  });
}

export async function notifyScheduledReminder(clientId: string, workerName: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Upcoming job reminder",
    body: `Your job with ${workerName} is in 24 hours`,
    data: { type: "scheduled_reminder" },
  });
}

export async function notifyJobCancelled(workerId: string, jobId: string): Promise<void> {
  await sendToUser(workerId, {
    title: "Job cancelled",
    body: "The client cancelled this job",
    data: { type: "job_cancelled", jobId },
  });
}

export async function notifyWorkerCancelledJob(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan cancelled",
    body: "Your artisan cancelled this job. You can request another worker.",
    data: { type: "worker_cancelled_job", jobId },
  });
}

export async function notifyChatMessage(
  recipientId: string,
  jobId: string,
  preview: string,
): Promise<void> {
  await sendToUser(recipientId, {
    title: "New message",
    body: preview,
    data: { type: "chat_message", jobId },
  });
}
