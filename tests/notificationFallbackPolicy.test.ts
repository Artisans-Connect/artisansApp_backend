import assert from "node:assert/strict";
import test from "node:test";
import { shouldAttemptFallback } from "../src/services/notificationFallbackPolicy";

test("falls back only for action-required notifications when FCM did not send", () => {
  assert.equal(shouldAttemptFallback({ priority: "action_required", fcmSent: false }), true);
  assert.equal(shouldAttemptFallback({ priority: "action_required", fcmSent: true }), false);
  assert.equal(shouldAttemptFallback({ priority: "status", fcmSent: false }), false);
  assert.equal(shouldAttemptFallback({ priority: "info", fcmSent: false }), false);
});
