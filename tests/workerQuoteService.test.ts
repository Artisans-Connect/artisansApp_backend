import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorkerQuote } from "../src/services/workerQuoteService";

test("worker quote uses worker-to-job distance and ASAP premium", () => {
  const quote = calculateWorkerQuote(
    {
      id: "job-1",
      category_id: "category-1",
      location_lat: 6.7,
      location_lng: -1.6,
      job_mode: "asap",
    },
    {
      id: "worker-1",
      current_lat: 6.71,
      current_lng: -1.61,
      location_at: new Date().toISOString(),
    },
    100,
    new Date("2026-07-09T09:00:00.000Z"),
  );

  assert.equal(quote.quote_currency, "GHS");
  assert.equal(quote.quoted_at, "2026-07-09T09:00:00.000Z");
  assert.equal(quote.base_service_fee, 100);
  assert.equal(quote.distance_km > 0, true);
  assert.equal(quote.distance_cost > 0, true);
  assert.equal(
    quote.total_quote,
    Math.round((quote.base_service_fee + quote.distance_cost + quote.urgency_premium) * 100) / 100,
  );
});

test("worker quote rejects stale worker locations", () => {
  assert.throws(() =>
    calculateWorkerQuote(
      {
        id: "job-1",
        category_id: "category-1",
        location_lat: 6.7,
        location_lng: -1.6,
        job_mode: "flexible",
      },
      {
        id: "worker-1",
        current_lat: 6.71,
        current_lng: -1.61,
        location_at: "2026-01-01T00:00:00.000Z",
      },
      100,
    ),
  );
});
