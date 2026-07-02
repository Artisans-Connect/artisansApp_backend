import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveWorkerJobStatus,
  isWorkerAssignmentBlockingStatus,
  shouldActivateScheduledJob,
  shouldDispatchJobOnCreate,
  statusForNewJob,
} from "../src/services/jobLifecycle";

test("new ASAP and flexible jobs open immediately, scheduled jobs stay dormant", () => {
  assert.equal(statusForNewJob("asap"), "searching");
  assert.equal(statusForNewJob("flexible"), "searching");
  assert.equal(statusForNewJob("scheduled"), "draft");
});

test("targeted scheduled jobs are not dispatched immediately", () => {
  assert.equal(shouldDispatchJobOnCreate("asap", true), true);
  assert.equal(shouldDispatchJobOnCreate("flexible", true), true);
  assert.equal(shouldDispatchJobOnCreate("scheduled", true), false);
});

test("scheduled jobs activate only inside the configured lead window", () => {
  const now = new Date("2026-06-30T10:00:00.000Z");

  assert.equal(
    shouldActivateScheduledJob("2026-06-30T10:30:00.000Z", now, 60 * 60 * 1000),
    true,
  );
  assert.equal(
    shouldActivateScheduledJob("2026-06-30T12:30:00.000Z", now, 60 * 60 * 1000),
    false,
  );
});

test("only genuinely active worker jobs block a new assignment", () => {
  for (const status of ["matched", "on_the_way", "arrived", "in_progress", "termination_requested"]) {
    assert.equal(isActiveWorkerJobStatus(status), true);
  }

  for (const status of ["searching", "matching", "pending_client_approval", "completed", "cancelled"]) {
    assert.equal(isActiveWorkerJobStatus(status), false);
  }
});

test("assignment blocking includes approval-pending jobs to prevent reopen double-booking", () => {
  for (const status of [
    "matched",
    "on_the_way",
    "arrived",
    "in_progress",
    "termination_requested",
    "pending_client_approval",
  ]) {
    assert.equal(isWorkerAssignmentBlockingStatus(status), true);
  }

  for (const status of ["searching", "matching", "completed", "cancelled"]) {
    assert.equal(isWorkerAssignmentBlockingStatus(status), false);
  }
});
