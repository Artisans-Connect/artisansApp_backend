import assert from "node:assert/strict";
import test from "node:test";
import {
  actionLabelForNotificationType,
  buildNotificationData,
  priorityForNotificationType,
  routeForNotificationType,
} from "../src/services/notificationPayloads";

test("job lifecycle notification data includes routing and action metadata", () => {
  const data = buildNotificationData("job_completion_submitted", {
    jobId: "job-123",
    actorId: "worker-123",
    actorName: "Kwame Mensah",
    jobTitle: "Fix leaking bathroom tap",
    roleTarget: "client",
  });

  assert.deepEqual(data, {
    type: "job_completion_submitted",
    jobId: "job-123",
    actorId: "worker-123",
    actorName: "Kwame Mensah",
    jobTitle: "Fix leaking bathroom tap",
    roleTarget: "client",
    priority: "action_required",
    route: "client_live_tracking",
    actionLabel: "Review work",
    groupKey: "job:job-123",
  });
});

test("notification type metadata is stable for first-batch routes", () => {
  assert.equal(priorityForNotificationType("new_job"), "action_required");
  assert.equal(priorityForNotificationType("worker_on_the_way"), "status");
  assert.equal(priorityForNotificationType("chat_message"), "info");

  assert.equal(routeForNotificationType("new_job"), "worker_job_request");
  assert.equal(routeForNotificationType("job_application_received"), "client_job_applicants");
  assert.equal(routeForNotificationType("job_application_accepted"), "worker_active_booking");
  assert.equal(routeForNotificationType("chat_message"), "chat_detail");

  assert.equal(actionLabelForNotificationType("new_job"), "View request");
  assert.equal(actionLabelForNotificationType("job_completion_submitted"), "Review work");
  assert.equal(actionLabelForNotificationType("termination_requested"), "Respond");
});

test("notification data omits empty optional fields but keeps a group key for jobs", () => {
  const data = buildNotificationData("worker_on_the_way", {
    jobId: "job-456",
    roleTarget: "client",
  });

  assert.equal(data.type, "worker_on_the_way");
  assert.equal(data.jobId, "job-456");
  assert.equal(data.roleTarget, "client");
  assert.equal(data.priority, "status");
  assert.equal(data.route, "client_live_tracking");
  assert.equal(data.actionLabel, "Track artisan");
  assert.equal(data.groupKey, "job:job-456");
  assert.equal("actorName" in data, false);
});

