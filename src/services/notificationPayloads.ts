export type NotificationPriority = "action_required" | "status" | "info";

export type NotificationRoute =
  | "worker_job_request"
  | "worker_active_booking"
  | "client_job_applicants"
  | "client_live_tracking"
  | "chat_detail"
  | "notifications";

export type NotificationDataInput = {
  jobId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  jobTitle?: string | null;
  roleTarget?: "client" | "worker" | null;
  [key: string]: string | null | undefined;
};

export type NotificationData = Record<string, string>;

const PRIORITY_BY_TYPE: Record<string, NotificationPriority> = {
  new_job: "action_required",
  job_application_received: "action_required",
  job_application_accepted: "action_required",
  job_completion_submitted: "action_required",
  completion_disputed: "action_required",
  work_progress_checkin: "action_required",
  scheduled_activation_blocked: "action_required",
  termination_requested: "action_required",
  worker_cancelled_job: "action_required",
  chat_message: "info",
  worker_on_the_way: "status",
  worker_arrived: "status",
  job_started: "status",
  job_matched: "status",
  job_completed: "status",
  client_cancelled_job: "status",
  job_cancelled: "status",
  job_expired: "status",
  scheduled_reminder: "status",
  scheduled_worker_reminder: "status",
  work_confirmed_done: "status",
  termination_resolved: "status",
};

const ROUTE_BY_TYPE: Record<string, NotificationRoute> = {
  new_job: "worker_job_request",
  job_application_received: "client_job_applicants",
  job_application_accepted: "worker_active_booking",
  chat_message: "chat_detail",
  worker_on_the_way: "client_live_tracking",
  worker_arrived: "client_live_tracking",
  job_started: "client_live_tracking",
  job_matched: "client_live_tracking",
  job_completion_submitted: "client_live_tracking",
  job_completed: "client_live_tracking",
  worker_cancelled_job: "client_live_tracking",
  client_cancelled_job: "worker_active_booking",
  job_cancelled: "worker_active_booking",
  job_expired: "client_live_tracking",
  scheduled_reminder: "client_live_tracking",
  scheduled_worker_reminder: "worker_active_booking",
  scheduled_activation_blocked: "client_live_tracking",
  completion_disputed: "worker_active_booking",
  work_progress_checkin: "worker_active_booking",
  work_confirmed_done: "worker_active_booking",
  termination_requested: "worker_active_booking",
  termination_resolved: "client_live_tracking",
};

const ACTION_LABEL_BY_TYPE: Record<string, string> = {
  new_job: "View request",
  job_application_received: "Review applicants",
  job_application_accepted: "Open booking",
  chat_message: "Reply",
  worker_on_the_way: "Track artisan",
  worker_arrived: "View status",
  job_started: "View progress",
  job_matched: "Track job",
  job_completion_submitted: "Review work",
  job_completed: "Rate service",
  worker_cancelled_job: "Find another worker",
  client_cancelled_job: "View job",
  job_cancelled: "View job",
  job_expired: "Try again",
  scheduled_reminder: "View booking",
  scheduled_worker_reminder: "View booking",
  scheduled_activation_blocked: "View job",
  completion_disputed: "Review job",
  work_progress_checkin: "Confirm job done",
  work_confirmed_done: "View job",
  termination_requested: "Respond",
  termination_resolved: "View job",
};

export function priorityForNotificationType(type: string): NotificationPriority {
  return PRIORITY_BY_TYPE[type] ?? "info";
}

export function routeForNotificationType(type: string): NotificationRoute {
  return ROUTE_BY_TYPE[type] ?? "notifications";
}

export function actionLabelForNotificationType(type: string): string {
  return ACTION_LABEL_BY_TYPE[type] ?? "Open";
}

export function buildNotificationData(type: string, input: NotificationDataInput = {}): NotificationData {
  const data: NotificationData = {
    type,
    priority: priorityForNotificationType(type),
    route: routeForNotificationType(type),
    actionLabel: actionLabelForNotificationType(type),
  };

  for (const [key, value] of Object.entries(input)) {
    if (value != null && value !== "") data[key] = String(value);
  }

  if (data.jobId && !data.groupKey) data.groupKey = `job:${data.jobId}`;
  return data;
}
