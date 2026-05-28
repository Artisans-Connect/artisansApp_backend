import { firebaseAdmin } from "../config/firebase";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function getProfileFcmToken(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("fcm_token").eq("id", userId).maybeSingle();
  return data?.fcm_token ?? null;
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
  const token = await getProfileFcmToken(userId);
  if (!token) {
    logger(`No FCM token for user ${userId}`);
    return;
  }
  try {
    await sendToToken(token, payload);
  } catch {
    // Do not crash caller paths on push failure.
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
