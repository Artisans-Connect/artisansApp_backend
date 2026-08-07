import assert from "node:assert/strict";
import test from "node:test";
import { JOB_STATUS } from "../src/constants/enums";
import {
  actionLabelForNotificationType,
  buildNotificationData,
  priorityForNotificationType,
  routeForNotificationType,
} from "../src/services/notificationPayloads";

test("JOB_STATUS contains AWAITING_PAYMENT", () => {
  assert.equal(JOB_STATUS.AWAITING_PAYMENT, "awaiting_payment");
});

test("bargaining and extra charge notifications metadata is correct", () => {
  // Test application countered (worker side)
  assert.equal(priorityForNotificationType("application_countered"), "action_required");
  assert.equal(routeForNotificationType("application_countered"), "worker_job_request");
  assert.equal(actionLabelForNotificationType("application_countered"), "Review counter-offer");

  // Test application countered (client side)
  assert.equal(priorityForNotificationType("application_countered_client"), "action_required");
  assert.equal(routeForNotificationType("application_countered_client"), "client_job_applicants");
  assert.equal(actionLabelForNotificationType("application_countered_client"), "Review counter-offer");

  // Test extra charge notifications
  assert.equal(priorityForNotificationType("extra_charge_proposed"), "action_required");
  assert.equal(routeForNotificationType("extra_charge_proposed"), "client_live_tracking");
  assert.equal(actionLabelForNotificationType("extra_charge_proposed"), "Review request");

  assert.equal(priorityForNotificationType("extra_charge_countered"), "action_required");
  assert.equal(routeForNotificationType("extra_charge_countered"), "worker_active_booking");
  assert.equal(actionLabelForNotificationType("extra_charge_countered"), "Review counter-offer");

  assert.equal(priorityForNotificationType("extra_charge_accepted"), "action_required");
  assert.equal(routeForNotificationType("extra_charge_accepted"), "client_live_tracking");
  assert.equal(actionLabelForNotificationType("extra_charge_accepted"), "Pay extra charge");
});

test("buildNotificationData formats bargaining payloads correctly", () => {
  const data = buildNotificationData("application_countered", {
    jobId: "job-111",
    roleTarget: "worker",
    counterRate: "85.00",
  });

  assert.equal(data.type, "application_countered");
  assert.equal(data.jobId, "job-111");
  assert.equal(data.roleTarget, "worker");
  assert.equal(data.counterRate, "85.00");
  assert.equal(data.priority, "action_required");
  assert.equal(data.route, "worker_job_request");
});
