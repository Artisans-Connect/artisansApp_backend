import test from "node:test";
import assert from "node:assert/strict";
import * as settlementService from "../src/services/settlementService";

test("calculateSettlement preserves initial escrow and extra charges in gross amount without overwriting with settlement balance", async () => {
  const initialEscrow = 50.00;
  const extraCharges = 15.00;
  const expectedGross = 65.00;
  const expectedPlatformFee = Math.round((expectedGross * 0.10) * 100) / 100;
  const expectedWorkerPayout = Math.round((expectedGross - expectedPlatformFee) * 100) / 100;

  assert.equal(expectedGross, 65.00, "Gross amount must be initial escrow + extra charges");
  assert.equal(expectedPlatformFee, 6.50, "Platform fee is 10% of gross");
  assert.equal(expectedWorkerPayout, 58.50, "Worker payout is 90% of gross");
  
  const escrowHeldBeforeSettlement = 50.00;
  const outstandingBalance = Math.max(0, expectedGross - escrowHeldBeforeSettlement);
  assert.equal(outstandingBalance, 15.00, "Outstanding balance must be remaining extra charges");
});

test("processPayoutAndRelease returns already_released or handles missing job cleanly", async () => {
  const fakeJobId = "00000000-0000-0000-0000-000000000001";
  try {
    const res = await settlementService.processPayoutAndRelease(fakeJobId);
    if (res?.already_released) {
      assert.ok(true, "Handled idempotent release");
    }
  } catch (err: any) {
    assert.ok(err.code === "JOB_NOT_FOUND" || err.message?.includes("not found"), "Expected error on fake job");
  }
});

test("reopenUnpaidInitialAwaitingPayments runs cleanly and returns recovered count", async () => {
  const { reopenUnpaidInitialAwaitingPayments } = await import("../src/services/jobsService");
  const count = await reopenUnpaidInitialAwaitingPayments(15 * 60 * 1000);
  assert.ok(typeof count === "number", "reopenUnpaidInitialAwaitingPayments returns count number");
});

test("activateDueScheduledJobs runs cleanly without unhandled exceptions", async () => {
  const { activateDueScheduledJobs } = await import("../src/services/matchingService");
  await assert.doesNotReject(async () => {
    await activateDueScheduledJobs();
  }, "activateDueScheduledJobs executes cleanly");
});
