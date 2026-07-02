import assert from "node:assert/strict";
import test from "node:test";
import { matchTradeNameLocally } from "../src/services/smartSearchService";

const trades = [
  "Carpenter",
  "Electrician",
  "Painter",
  "Phone Repairer",
  "Plumber",
];

test("matches a named trade regardless of case", () => {
  assert.equal(matchTradeNameLocally("I work as a PLUMBER", trades), "Plumber");
});

test("matches a natural-language trade description", () => {
  assert.equal(matchTradeNameLocally("I do house wiring", trades), "Electrician");
  assert.equal(matchTradeNameLocally("fix sink", trades), "Plumber");
});

test("matches expanded signup trades without needing AI", () => {
  assert.equal(
    matchTradeNameLocally("I fix generators and service gensets", [
      "Generator Technician",
      "Electrician",
    ]),
    "Generator Technician",
  );
  assert.equal(
    matchTradeNameLocally("I install solar panels and inverters", [
      "Solar Technician",
      "Electrician",
    ]),
    "Solar Technician",
  );
  assert.equal(
    matchTradeNameLocally("I repair boreholes and pressure pumps", [
      "Borehole / Pump Technician",
      "Plumber",
    ]),
    "Borehole / Pump Technician",
  );
});

test("does not invent a trade outside the active catalog", () => {
  assert.equal(matchTradeNameLocally("I repair watches", trades), null);
});

test("returns null for an empty query", () => {
  assert.equal(matchTradeNameLocally("   ", trades), null);
});
