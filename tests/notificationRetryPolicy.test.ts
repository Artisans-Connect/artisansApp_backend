import assert from "node:assert/strict";
import test from "node:test";
import { retryDelays } from "../src/services/notificationRetryPolicy";

test("uses bounded exponential retry delays", () => {
  assert.deepEqual(retryDelays(1), []);
  assert.deepEqual(retryDelays(3, 500), [500, 1000]);
});
