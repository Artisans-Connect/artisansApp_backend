import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidGhanaPostCode,
  normalizeGhanaPostCode,
  resolveGhanaPostAddress,
  reverseGhanaPostCoordinates,
} from "../src/services/ghanaPostGpsService";

test("normalizeGhanaPostCode handles dashless, spaced, and standard inputs correctly", () => {
  // Standard format
  assert.equal(normalizeGhanaPostCode("AK-039-5028"), "AK-039-5028");
  assert.equal(normalizeGhanaPostCode("ga-183-9022"), "GA-183-9022");
  assert.equal(normalizeGhanaPostCode("EN-1234-5678"), "EN-1234-5678");

  // Dashless inputs (without hyphens)
  assert.equal(normalizeGhanaPostCode("AK0395028"), "AK-039-5028");
  assert.equal(normalizeGhanaPostCode("ga1839022"), "GA-183-9022");
  assert.equal(normalizeGhanaPostCode("EN12345678"), "EN-1234-5678");

  // Spaced inputs
  assert.equal(normalizeGhanaPostCode("AK 039 5028"), "AK-039-5028");
  assert.equal(normalizeGhanaPostCode("ga  183  9022"), "GA-183-9022");

  // Partial hyphens
  assert.equal(normalizeGhanaPostCode("AK-039 5028"), "AK-039-5028");
  assert.equal(normalizeGhanaPostCode("ga183-9022"), "GA-183-9022");

  // Invalid inputs
  assert.equal(normalizeGhanaPostCode(""), null);
  assert.equal(normalizeGhanaPostCode("A-123-4567"), null); // 1-letter prefix
  assert.equal(normalizeGhanaPostCode("AK-12-3456"), null); // 2-digit district
  assert.equal(normalizeGhanaPostCode("AK-123-456"), null); // 3-digit address
  assert.equal(normalizeGhanaPostCode("INVALID"), null);
});

test("isValidGhanaPostCode validates GhanaPost GPS address syntax correctly", () => {
  // Valid codes (standard or dashless/spaced)
  assert.equal(isValidGhanaPostCode("AK-039-5028"), true);
  assert.equal(isValidGhanaPostCode("ga-183-9022"), true);
  assert.equal(isValidGhanaPostCode("AK0395028"), true); // Dashless
  assert.equal(isValidGhanaPostCode("ga 183 9022"), true); // Spaced
  assert.equal(isValidGhanaPostCode("EN-1234-5678"), true);

  // Invalid codes
  assert.equal(isValidGhanaPostCode(""), false);
  assert.equal(isValidGhanaPostCode("A-123-4567"), false);
  assert.equal(isValidGhanaPostCode("AK-12-3456"), false);
  assert.equal(isValidGhanaPostCode("INVALID"), false);
});

test("resolveGhanaPostAddress returns null for invalid formats immediately", async () => {
  const result = await resolveGhanaPostAddress("invalid-code");
  assert.equal(result, null);

  const empty = await resolveGhanaPostAddress("");
  assert.equal(empty, null);
});

test("reverseGhanaPostCoordinates returns null for invalid coordinates", async () => {
  const result = await reverseGhanaPostCoordinates(NaN, NaN);
  assert.equal(result, null);
});
