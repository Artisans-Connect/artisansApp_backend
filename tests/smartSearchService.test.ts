import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingCategories } from "../src/utils/skillMatch";

const catalog = [
  {
    slug: "electrical_power",
    name: "Electrical & Power",
    description: "Wiring, solar panels, appliance repair, and backup generators",
    subcategories: [
      { slug: "electrician", name: "Electrician", description: "Wiring and socket installation" },
      { slug: "generator_technician", name: "Generator Technician", description: "Generator repair" },
    ],
  },
  {
    slug: "electronics_it",
    name: "Electronics, Phones & IT Repairs",
    description: "Phone screen replacement, laptops, TV, and printer setups",
    subcategories: [
      { slug: "phone_repairer", name: "Phone Repairer", description: "Screen replacement" },
      { slug: "laptop_technician", name: "Laptop Technician", description: "Keyboard repair" },
    ],
  },
  {
    slug: "home_repairs",
    name: "Home Repairs & Maintenance",
    description: "General handyman, furniture fixes, window lock repairs, and cleaning",
    subcategories: [
      { slug: "pest_control_worker", name: "Pest Control Worker", description: "Fumigation" },
    ],
  },
];

test("matches current catalog subcategory names, not only hard-coded category aliases", () => {
  assert.equal(findMatchingCategories("my generator is not starting", catalog)[0]?.slug, "electrical_power");
  assert.equal(findMatchingCategories("replace my phone screen", catalog)[0]?.slug, "electronics_it");
  assert.equal(findMatchingCategories("need fumigation for cockroaches", catalog)[0]?.slug, "home_repairs");
});

test("returns no catalog match for unrelated queries", () => {
  assert.deepEqual(findMatchingCategories("teach me accounting", catalog), []);
});
