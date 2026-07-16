import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReopenAfterWorkerCancelPatch,
  isActiveWorkerJobStatus,
  isRedispatchBlockingDispatchStatus,
  isRecoverableServiceInterruption,
  isWorkerAssignmentBlockingStatus,
  shouldActivateScheduledJob,
  shouldDispatchJobOnCreate,
  statusForNewJob,
} from "../src/services/jobLifecycle";

test("all new jobs open immediately, including scheduled ones", () => {
  assert.equal(statusForNewJob("asap"), "searching");
  assert.equal(statusForNewJob("flexible"), "searching");
  // Scheduled jobs are visible from creation so workers can plan ahead;
  // they only become an active assignment near the scheduled time.
  assert.equal(statusForNewJob("scheduled"), "searching");
});

test("targeted jobs dispatch immediately; untargeted scheduled jobs skip the round engine", () => {
  assert.equal(shouldDispatchJobOnCreate("asap", true), true);
  assert.equal(shouldDispatchJobOnCreate("flexible", true), true);
  // The requested worker hears about a scheduled job right away...
  assert.equal(shouldDispatchJobOnCreate("scheduled", true), true);
  // ...but open scheduled jobs are not driven by the ASAP round engine.
  assert.equal(shouldDispatchJobOnCreate("scheduled", false), false);
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

  for (const status of [
    "searching",
    "matching",
    "scheduled_confirmed",
    "pending_client_approval",
    "completed",
    "cancelled",
  ]) {
    assert.equal(isActiveWorkerJobStatus(status), false);
  }
});

test("a confirmed scheduled job never blocks the worker from other assignments", () => {
  assert.equal(isWorkerAssignmentBlockingStatus("scheduled_confirmed"), false);
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

test("reopening after worker cancellation clears stale assignment and cancellation fields", () => {
  const patch = buildReopenAfterWorkerCancelPatch(
    "2026-07-04T12:00:00.000Z",
    "2026-07-04T12:45:00.000Z",
  );

  assert.equal(patch.status, "matching");
  assert.equal(patch.worker_id, null);
  assert.equal(patch.requested_worker_id, null);
  assert.equal(patch.cancelled_by, null);
  assert.equal(patch.cancelled_reason, null);
  assert.equal(patch.cancelled_at, null);
  assert.equal(patch.cancellation_stage, null);
  assert.equal(patch.cancellation_fee, 0);
  assert.equal(patch.cancellation_fee_currency, "GHS");
  assert.equal(patch.expires_at, "2026-07-04T12:45:00.000Z");
  assert.equal(patch.updated_at, "2026-07-04T12:00:00.000Z");
});

test("recoverable service interruptions can re-enter worker search", () => {
  assert.equal(isRecoverableServiceInterruption("cancelled", "worker", null), true);
  assert.equal(
    isRecoverableServiceInterruption("cancelled", "client", "termination_requested"),
    true,
  );
});

test("ordinary terminal cancellations cannot re-enter worker search", () => {
  assert.equal(isRecoverableServiceInterruption("cancelled", "client", "free"), false);
  assert.equal(isRecoverableServiceInterruption("cancelled", "client", null), false);
  assert.equal(isRecoverableServiceInterruption("completed", "worker", null), false);
});

test("only active dispatches block a worker from renewed redispatch", () => {
  for (const status of ["sent", "seen", "accepted"]) {
    assert.equal(isRedispatchBlockingDispatchStatus(status), true);
  }

  for (const status of ["declined", "expired", "cancelled", "withdrawn", null]) {
    assert.equal(isRedispatchBlockingDispatchStatus(status), false);
  }
});
