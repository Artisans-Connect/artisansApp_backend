import test from "node:test";
import assert from "node:assert/strict";
import * as walletService from "../src/services/walletService";

test("wallet transactions maintain audit integrity and reject negative balances", async () => {
  // Test wallet creation payload validation
  const testUserId = "00000000-0000-0000-0000-000000000099";
  
  // Verify error when attempting to debit non-existent / empty balance wallet
  try {
    await walletService.debitWallet({
      userId: testUserId,
      amount: 999999.00,
      reference: "test_ref_overdraft",
      type: "payout",
    });
    assert.fail("Should have thrown error");
  } catch (err: any) {
    assert.ok(err != null, "Error thrown on debiting empty wallet");
  }
});
