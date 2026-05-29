import { supabaseAdmin } from "../src/config/supabase";

const rows = [
  { name: "Plumbing", slug: "plumbing", icon_name: "plumbing", sort_order: 1 },
  { name: "Electrical", slug: "electrical", icon_name: "electrical_services", sort_order: 2 },
  { name: "Carpentry", slug: "carpentry", icon_name: "carpenter", sort_order: 3 },
  { name: "Cleaning", slug: "cleaning", icon_name: "cleaning_services", sort_order: 4 },
  { name: "Painting", slug: "painting", icon_name: "format_paint", sort_order: 5 },
  { name: "Construction", slug: "construction", icon_name: "construction", sort_order: 6 },
  { name: "HVAC", slug: "hvac", icon_name: "hvac", sort_order: 7 },
  { name: "Landscaping", slug: "landscaping", icon_name: "grass", sort_order: 8 },
];

async function main() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: true })
    .select();

  if (error) {
    console.error("SEED_FAILED:", error.message);
    process.exit(1);
  }

  console.log(`SEED_OK: ${data?.length ?? 0} categories`);
}

main();
