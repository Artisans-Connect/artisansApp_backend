import { supabaseAdmin } from "../src/config/supabase";

async function main() {
  console.log("Applying subcategory base_fee updates to Supabase...");

  const updates: Array<{ slug: string; base_fee: number }> = [
    { slug: "solar_technician", base_fee: 150 },
    { slug: "generator_technician", base_fee: 120 },
    { slug: "heavy_equipment_mechanic", base_fee: 200 },
    { slug: "borehole_pump_technician", base_fee: 120 },
    { slug: "cctv_security_installer", base_fee: 100 },
  ];

  for (const item of updates) {
    const { error } = await supabaseAdmin
      .from("subcategories")
      .update({ base_fee: item.base_fee })
      .eq("slug", item.slug);

    if (error) {
      console.warn(`Could not update base_fee for ${item.slug}:`, error.message);
    } else {
      console.log(`Updated base_fee for subcategory "${item.slug}" -> GH₵ ${item.base_fee}`);
    }
  }

  console.log("Subcategory base_fee update completed successfully.");
}

main().catch((err) => {
  console.error("Migration script error:", err);
  process.exit(1);
});
