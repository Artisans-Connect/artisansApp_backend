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
  console.log("Starting deletion of legacy category rows from Supabase...");
  
  // 1. Fetch current categories
  const { data: categories, error: fetchErr } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug");

  if (fetchErr) {
    console.error("Failed to fetch categories:", fetchErr.message);
    process.exit(1);
  }

  const categoryMap = new Map<string, string>();
  categories?.forEach((cat) => categoryMap.set(cat.slug, cat.id));

  const legacySlugs = Object.keys(LEGACY_MAP);
  console.log(`Initial total categories in DB: ${categories?.length ?? 0}`);

  // 2. Ensure all FK references (subcategories & jobs) are moved to parent categories
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
      if (subErr) console.error(`Reassign subcategories error for ${legacySlug}:`, subErr.message);

      // Reassign jobs
      const { error: jobErr } = await supabaseAdmin
        .from("jobs")
        .update({ category_id: parentId })
        .eq("category_id", legacyId);
      if (jobErr) console.error(`Reassign jobs error for ${legacySlug}:`, jobErr.message);
    }
  }

  // 3. Delete legacy category rows
  const legacyIdsToDelete = legacySlugs
    .map((slug) => categoryMap.get(slug))
    .filter((id): id is string => Boolean(id));

  if (legacyIdsToDelete.length > 0) {
    const { error: deleteErr } = await supabaseAdmin
      .from("categories")
      .delete()
      .in("id", legacyIdsToDelete);

    if (deleteErr) {
      console.error("Failed to delete legacy categories:", deleteErr.message);
      process.exit(1);
    }
    console.log(`Successfully deleted ${legacyIdsToDelete.length} legacy category rows from Supabase.`);
  } else {
    console.log("No legacy categories were found to delete.");
  }

  // 4. Verify remaining categories count
  const { data: remaining, error: remErr } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, is_active")
    .order("sort_order", { ascending: true });

  if (remErr) {
    console.error("Failed to verify remaining categories:", remErr.message);
  } else {
    console.log(`\nRemaining active categories in DB (${remaining?.length ?? 0}):`);
    remaining?.forEach((cat) => console.log(` - [${cat.slug}] ${cat.name}`));
  }
}

main().catch((err) => {
  console.error("Deletion script execution failed:", err);
  process.exit(1);
});
