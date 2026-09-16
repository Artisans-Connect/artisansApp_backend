import assert from "node:assert/strict";
import test from "node:test";
import { createJobSchema } from "../src/validators/jobs.validator";
import { estimateFee } from "../src/services/pricingService";

test("createJobSchema validates diagnostic archetype and workshop service mode", () => {
  const payload = {
    category_id: "plumbing_water",
    title: "Toilet water leak inspection",
    description: "Water leaking under the bowl, cause unknown. Need inspection.",
    location_lat: 6.6745,
    location_lng: -1.5716,
    address_label: "Ayeduase, near police post",
    job_mode: "asap",
    job_archetype: "diagnostic",
    budget_type: "fixed",
    budget_fixed: 40,
    diagnostic_fee: 40,
    service_type: "home_visit",
    landmark_description: "Opposite KNUST commercial gate, 2nd yellow house",
    archetype_payload: {
      symptoms: ["water_leaking", "unknown_cause"],
      is_emergency: false,
    },
  };

  const parsed = createJobSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.job_archetype, "diagnostic");
    assert.equal(parsed.data.diagnostic_fee, 40);
    assert.equal(parsed.data.landmark_description, "Opposite KNUST commercial gate, 2nd yellow house");
  }
});

test("createJobSchema validates workshop drop-off service mode for electronics repair", () => {
  const payload = {
    category_id: "electronics_it",
    title: "Cracked phone screen replacement",
    description: "Samsung Galaxy A54 glass shattered. Touch still works.",
    location_lat: 6.6900,
    location_lng: -1.6200,
    address_label: "Adum Central, Kumasi",
    job_mode: "flexible",
    job_archetype: "fixed_scope",
    budget_type: "fixed",
    budget_fixed: 250,
    service_type: "workshop",
  };

  const parsed = createJobSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.service_type, "workshop");
  }
});

test("createJobSchema validates custom build archetype with milestone stages", () => {
  const payload = {
    category_id: "construction_building",
    title: "Fabricate sliding metal gate",
    description: "Custom gate for compound, 12ft wide by 7ft high, wrought iron.",
    location_lat: 6.6800,
    location_lng: -1.5800,
    address_label: "Ahodwo, Kumasi",
    job_mode: "scheduled",
    scheduled_for: new Date(Date.now() + 86400000).toISOString(),
    job_archetype: "custom_build",
    budget_type: "range",
    budget_min: 2000,
    budget_max: 3500,
    service_type: "home_visit",
    milestone_stages: [
      { stage: 1, title: "Materials Procurement (Iron & Wheels)", percentage: 50, amount: 1500 },
      { stage: 2, title: "Welding & Installation on site", percentage: 50, amount: 1500 },
    ],
  };

  const parsed = createJobSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.job_archetype, "custom_build");
    assert.equal(parsed.data.milestone_stages?.length, 2);
  }
});

test("estimateFee returns standard callout fee for diagnostic jobs", async () => {
  const estimate = await estimateFee(
    "electrical_power",
    6.6745,
    -1.5716,
    "asap",
    null,
    "diagnostic",
  );

  assert.equal(estimate.minimum_fee, 40);
  assert.equal(estimate.breakdown.base_service_fee, 40);
  assert.equal(estimate.breakdown.urgency_premium, 0);
});
