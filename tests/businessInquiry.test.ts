import assert from "node:assert/strict";
import test from "node:test";
import {
  createBusinessInquirySchema,
  updateBusinessInquirySchema,
} from "../src/validators/businessInquiryValidator";

test("createBusinessInquirySchema validates valid corporate inquiry submissions", () => {
  const valid = {
    business_name: "Apex Properties Ltd",
    contact_name: "Kwame Mensah",
    phone: "+233 24 123 4567",
    email: "kwame@apexproperties.gh",
    business_type: "Property Management",
    units_count: "45 apartments",
    message: "Need SLA plumbing and electrical maintenance contract for Ridge residence.",
  };

  const result = createBusinessInquirySchema.safeParse(valid);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.business_name, "Apex Properties Ltd");
    assert.equal(result.data.phone, "+233 24 123 4567");
  }
});

test("createBusinessInquirySchema accepts inquiry without optional email or message", () => {
  const minimal = {
    business_name: "Ridge Suites",
    contact_name: "Akosua Osei",
    phone: "0209876543",
  };

  const result = createBusinessInquirySchema.safeParse(minimal);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.business_type, "Property Management");
    assert.equal(result.data.units_count, "");
  }
});

test("createBusinessInquirySchema rejects invalid or missing fields", () => {
  const missingName = {
    contact_name: "Kwame",
    phone: "0241234567",
  };
  assert.equal(createBusinessInquirySchema.safeParse(missingName).success, false);

  const invalidPhone = {
    business_name: "Company",
    contact_name: "Kwame",
    phone: "abc-invalid",
  };
  assert.equal(createBusinessInquirySchema.safeParse(invalidPhone).success, false);
});

test("updateBusinessInquirySchema validates status updates and notes", () => {
  const update = {
    status: "QUALIFIED" as const,
    notes: "Spoke with facility head. Scheduled on-site inspection for Thursday.",
  };
  const result = updateBusinessInquirySchema.safeParse(update);
  assert.equal(result.success, true);
});
