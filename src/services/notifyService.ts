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
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          channelId: "high_importance_channel",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            contentAvailable: true,
          },
        },
      },
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

export async function notifyCompletionSubmitted(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Work submitted for approval",
    body: "Review the completed work and approve it when you are satisfied",
    data: { type: "job_completion_submitted" },
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
  senderId: string,
  recipientId: string,
  jobId: string,
): Promise<void> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", senderId).maybeSingle();
  const senderName = profile?.full_name?.split(" ")[0] ?? "someone";

  await sendToUser(recipientId, {
    title: "New message",
    body: `Text from ${senderName}`,
    data: { type: "chat_message", jobId },
  });
}

export async function notifyClientCancelledWithFee(
  workerId: string,
  jobId: string,
  stage: string,
  feeAmount: number,
): Promise<void> {
  const bodyText =
    feeAmount > 0
      ? `The client cancelled this job. You are entitled to GH₵ ${feeAmount.toFixed(2)} compensation. Please collect from the client.`
      : stage === "warning"
        ? "The client cancelled this job shortly after accepting."
        : "The client cancelled this job.";

  await sendToUser(workerId, {
    title: "Job cancelled by client",
    body: bodyText,
    data: { type: "client_cancelled_job", jobId, stage, feeAmount: String(feeAmount) },
  });
}

export async function notifyTerminationRequested(
  workerId: string,
  jobId: string,
  reason: string,
): Promise<void> {
  await sendToUser(workerId, {
    title: "Client requests job termination",
    body: reason || "The client has requested to terminate this job.",
    data: { type: "termination_requested", jobId },
  });
}

export async function notifyTerminationResolved(
  clientId: string,
  jobId: string,
  accepted: boolean,
): Promise<void> {
  await sendToUser(clientId, {
    title: accepted ? "Termination accepted" : "Termination declined",
    body: accepted
      ? "The artisan has accepted the termination. The job has been cancelled."
      : "The artisan has declined the termination and will continue working.",
    data: { type: "termination_resolved", jobId, accepted: String(accepted) },
  });
}
