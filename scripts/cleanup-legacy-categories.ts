import { supabaseAdmin } from "../src/config/supabase";

const LEGACY_MAP: Record<string, string> = {
  plumbing: "plumbing_water",
  electrical: "electrical_power",
  carpentry: "construction_building",
  masonry: "construction_building",
  welding: "construction_building",
  construction: "construction_building",
  automotive: "auto_mechanical",
  painting: "construction_building",
  tiling: "construction_building",
  roofing: "construction_building",
  hvac: "home_repairs",
  appliance_repair: "electrical_power",
  cleaning: "home_repairs",
  landscaping: "home_repairs",
  fashion: "beauty_fashion",
  beauty: "beauty_fashion",
  catering: "hospitality_events",
  upholstery: "home_repairs",
  security: "electrical_power",
  ict_support: "electronics_it",
};

async function main() {
  console.log("Fetching current categories from Supabase...");
  const { data: categories, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, is_active");

  if (error) {
    console.error("Failed to fetch categories:", error.message);
    process.exit(1);
  }

  const categoryMap = new Map<string, string>();
  categories?.forEach((cat) => {
    categoryMap.set(cat.slug, cat.id);
  });

  const legacySlugs = Object.keys(LEGACY_MAP);
  console.log(`Found ${categories?.length ?? 0} total categories in DB.`);

  for (const legacySlug of legacySlugs) {
    const parentSlug = LEGACY_MAP[legacySlug];
    const legacyId = categoryMap.get(legacySlug);
    const parentId = categoryMap.get(parentSlug);

    if (legacyId && parentId) {
      // Reassign subcategories
      const { error: subErr } = await supabaseAdmin
        .from("subcategories")
        .update({ category_id: parentId })
        .eq("category_id", legacyId);
      if (subErr) console.error(`Failed to reassign subcategories for ${legacySlug}:`, subErr.message);

      // Reassign jobs
      const { error: jobErr } = await supabaseAdmin
        .from("jobs")
        .update({ category_id: parentId })
        .eq("category_id", legacyId);
      if (jobErr) console.error(`Failed to reassign jobs for ${legacySlug}:`, jobErr.message);

      // Deactivate legacy category
      const { error: deactErr } = await supabaseAdmin
        .from("categories")
        .update({ is_active: false })
        .eq("id", legacyId);
      if (deactErr) {
        console.error(`Failed to deactivate ${legacySlug}:`, deactErr.message);
      } else {
        console.log(`Successfully deactivated legacy category: "${legacySlug}" (reassigned to "${parentSlug}")`);
      }
    } else if (legacyId) {
      const { error: deactErr } = await supabaseAdmin
        .from("categories")
        .update({ is_active: false })
        .eq("id", legacyId);
      if (deactErr) {
        console.error(`Failed to deactivate ${legacySlug}:`, deactErr.message);
      } else {
        console.log(`Deactivated legacy category: "${legacySlug}"`);
      }
    }
  }

  console.log("Category cleanup complete!");
}

main().catch((err) => {
  console.error("Cleanup script error:", err);
  process.exit(1);
});
