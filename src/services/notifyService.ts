import { firebaseAdmin } from "../config/firebase";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { buildNotificationData } from "./notificationPayloads";

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
    data: buildNotificationData("new_job", {
      jobId: job.id,
      jobTitle: job.title,
      roleTarget: "worker",
    }),
  });
}

export async function notifyJobMatched(clientId: string, jobId: string, workerName: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan matched",
    body: `${workerName} accepted your job`,
    data: buildNotificationData("job_matched", {
      jobId,
      actorName: workerName,
      roleTarget: "client",
    }),
  });
}

export async function notifyClientWorkerApplied(
  clientId: string,
  jobId: string,
  workerName: string,
): Promise<void> {
  await sendToUser(clientId, {
    title: "New artisan interested",
    body: `${workerName} wants to take your job`,
    data: buildNotificationData("job_application_received", {
      jobId,
      actorName: workerName,
      roleTarget: "client",
    }),
  });
}

export async function notifyWorkerApplicationAccepted(
  workerId: string,
  jobId: string,
): Promise<void> {
  await sendToUser(workerId, {
    title: "Application accepted",
    body: "The client selected you for this job",
    data: buildNotificationData("job_application_accepted", {
      jobId,
      roleTarget: "worker",
    }),
  });
}

export async function notifyJobStarted(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Work started",
    body: "Your artisan has started the job",
    data: buildNotificationData("job_started", { jobId, roleTarget: "client" }),
  });
}

export async function notifyWorkerOnTheWay(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan on the way",
    body: "Your artisan is heading to your location",
    data: buildNotificationData("worker_on_the_way", { jobId, roleTarget: "client" }),
  });
}

export async function notifyWorkerArrived(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan arrived",
    body: "Your artisan has arrived at the job location",
    data: buildNotificationData("worker_arrived", { jobId, roleTarget: "client" }),
  });
}

export async function notifyJobExpired(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "No artisan found",
    body: "We could not find an available worker. You can try again.",
    data: buildNotificationData("job_expired", { jobId, roleTarget: "client" }),
  });
}

export async function notifyJobCompleted(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Job completed",
    body: "Please rate your artisan",
    data: buildNotificationData("job_completed", { jobId, roleTarget: "client" }),
  });
}

export async function notifyCompletionSubmitted(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Work submitted for approval",
    body: "Review the completed work and approve it when you are satisfied",
    data: buildNotificationData("job_completion_submitted", { jobId, roleTarget: "client" }),
  });
}

export async function notifyScheduledReminder(clientId: string, jobId: string, workerName: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Upcoming job reminder",
    body: `Your job with ${workerName} is in 24 hours`,
    data: buildNotificationData("scheduled_reminder", {
      jobId,
      actorName: workerName,
      roleTarget: "client",
    }),
  });
}

export async function notifyScheduledReminderUnmatched(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Upcoming job reminder",
    body: "Your scheduled job is in 24 hours. We are still finding an artisan for you.",
    data: buildNotificationData("scheduled_reminder", { jobId, roleTarget: "client" }),
  });
}

export async function notifyWorkerScheduledDayOf(workerId: string, jobId: string, jobTitle: string): Promise<void> {
  await sendToUser(workerId, {
    title: "Scheduled job today",
    body: `${jobTitle} is scheduled for today. Plan your day accordingly.`,
    data: buildNotificationData("scheduled_worker_reminder", {
      jobId,
      jobTitle,
      roleTarget: "worker",
    }),
  });
}

export async function notifyWorkerScheduledSoon(workerId: string, jobId: string, jobTitle: string): Promise<void> {
  await sendToUser(workerId, {
    title: "Scheduled job in 2 hours",
    body: `${jobTitle} starts in about 2 hours. Get ready to head out.`,
    data: buildNotificationData("scheduled_worker_reminder", {
      jobId,
      jobTitle,
      roleTarget: "worker",
    }),
  });
}

export async function notifyScheduledActivationBlocked(
  clientId: string,
  workerId: string,
  jobId: string,
): Promise<void> {
  await sendToUser(clientId, {
    title: "Scheduled artisan unavailable",
    body: "Your scheduled artisan is busy with another job. We are finding you a replacement.",
    data: buildNotificationData("scheduled_activation_blocked", { jobId, roleTarget: "client" }),
  });
  await sendToUser(workerId, {
    title: "Scheduled job released",
    body: "You were still on another job at the scheduled time, so the job was opened to other artisans.",
    data: buildNotificationData("scheduled_activation_blocked", { jobId, roleTarget: "worker" }),
  });
}

export async function notifyWorkProgressCheckIn(
  userId: string,
  jobId: string,
  roleTarget: "client" | "worker",
): Promise<void> {
  await sendToUser(userId, {
    title: "Work progress check-in",
    body: "How is the job going? Tap to let us know once the work is finished.",
    data: buildNotificationData("work_progress_checkin", { jobId, roleTarget }),
  });
}

export async function notifyWorkConfirmedDone(
  userId: string,
  jobId: string,
  roleTarget: "client" | "worker",
): Promise<void> {
  const body =
    roleTarget === "worker"
      ? "The client confirmed the work is finished. Submit your completion details."
      : "Your artisan confirmed the work is finished. You'll be asked to approve the completion.";
  await sendToUser(userId, {
    title: "Work marked as finished",
    body,
    data: buildNotificationData("work_confirmed_done", { jobId, roleTarget }),
  });
}

export async function notifyCompletionDisputed(
  workerId: string,
  jobId: string,
  note: string,
): Promise<void> {
  await sendToUser(workerId, {
    title: "Client reported job incomplete",
    body: note || "The client says the job isn't finished yet. Please review and continue the work.",
    data: buildNotificationData("completion_disputed", { jobId, roleTarget: "worker" }),
  });
}

export async function notifyJobCancelled(workerId: string, jobId: string): Promise<void> {
  await sendToUser(workerId, {
    title: "Job cancelled",
    body: "The client cancelled this job",
    data: buildNotificationData("job_cancelled", { jobId, roleTarget: "worker" }),
  });
}

export async function notifyWorkerCancelledJob(clientId: string, jobId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan cancelled",
    body: "Your artisan cancelled this job. You can request another worker.",
    data: buildNotificationData("worker_cancelled_job", { jobId, roleTarget: "client" }),
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
    data: buildNotificationData("chat_message", {
      jobId,
      actorId: senderId,
      actorName: senderName,
    }),
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
    data: buildNotificationData("client_cancelled_job", {
      jobId,
      stage,
      feeAmount: String(feeAmount),
      roleTarget: "worker",
    }),
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
    data: buildNotificationData("termination_requested", { jobId, roleTarget: "worker" }),
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
    data: buildNotificationData("termination_resolved", {
      jobId,
      accepted: String(accepted),
      roleTarget: "client",
    }),
  });
}
