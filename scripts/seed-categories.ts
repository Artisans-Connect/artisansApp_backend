import { supabaseAdmin } from "../src/config/supabase";

const rows = [
  { name: "Plumbing", slug: "plumbing", icon_name: "drop", color_hex: "#4648D4", description: "Repairs, installation, maintenance", sort_order: 1 },
  { name: "Electrical", slug: "electrical", icon_name: "lightning", color_hex: "#0058BE", description: "Wiring, repairs, installations", sort_order: 2 },
  { name: "Carpentry", slug: "carpentry", icon_name: "wrench", color_hex: "#B55D00", description: "Furniture, cabinets, doors, woodwork", sort_order: 3 },
  { name: "Masonry & Blockwork", slug: "masonry", icon_name: "bricks", color_hex: "#8B5E3C", description: "Blocks, plastering, concrete and masonry repairs", sort_order: 4 },
  { name: "Welding & Fabrication", slug: "welding", icon_name: "fire", color_hex: "#607D8B", description: "Metal gates, burglar proofing and fabrication", sort_order: 5 },
  { name: "Construction & Renovation", slug: "construction", icon_name: "barricade", color_hex: "#FF9800", description: "Building, renovation and structural repairs", sort_order: 6 },
  { name: "Automotive & Small Engine", slug: "automotive", icon_name: "car", color_hex: "#795548", description: "Vehicle, motorbike and small engine repairs", sort_order: 7 },
  { name: "Painting", slug: "painting", icon_name: "palette", color_hex: "#F44336", description: "Interior, exterior and decorative painting", sort_order: 8 },
  { name: "Tiling & Flooring", slug: "tiling", icon_name: "squares_four", color_hex: "#009688", description: "Floor tiles, wall tiles and floor finishing", sort_order: 9 },
  { name: "Roofing & Ceiling", slug: "roofing", icon_name: "house_line", color_hex: "#9C27B0", description: "Roofing sheets, ceiling panels and leak fixes", sort_order: 10 },
  { name: "HVAC & Refrigeration", slug: "hvac", icon_name: "snowflake", color_hex: "#2196F3", description: "Cooling, refrigeration and ventilation", sort_order: 11 },
  { name: "Appliance & Electronics Repair", slug: "appliance_repair", icon_name: "plug", color_hex: "#3F51B5", description: "Home appliances, electronics and diagnostics", sort_order: 12 },
  { name: "Cleaning", slug: "cleaning", icon_name: "broom", color_hex: "#00A86B", description: "Home, office and deep cleaning", sort_order: 13 },
  { name: "Landscaping", slug: "landscaping", icon_name: "mountains", color_hex: "#4CAF50", description: "Lawn, garden and outdoor maintenance", sort_order: 14 },
  { name: "Fashion & Dressmaking", slug: "fashion", icon_name: "scissors", color_hex: "#E91E63", description: "Tailoring, alterations and garment making", sort_order: 15 },
  { name: "Hair & Beauty", slug: "beauty", icon_name: "scissors", color_hex: "#AD1457", description: "Hairdressing, barbering and beauty services", sort_order: 16 },
  { name: "Catering & Events", slug: "catering", icon_name: "fork_knife", color_hex: "#C15A3D", description: "Cooking, baking and event food services", sort_order: 17 },
  { name: "Upholstery", slug: "upholstery", icon_name: "armchair", color_hex: "#6D4C41", description: "Sofas, cushions, curtains and soft furnishings", sort_order: 18 },
  { name: "Security & Locksmith", slug: "security", icon_name: "lock_key", color_hex: "#455A64", description: "Locks, keys, burglar proofing and access repairs", sort_order: 19 },
  { name: "ICT & Device Support", slug: "ict_support", icon_name: "desktop_tower", color_hex: "#1565C0", description: "Computer, phone, network and device support", sort_order: 20 },
];

async function main() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .upsert(rows, { onConflict: "slug" })
    .select();

  if (error) {
    console.error("SEED_FAILED:", error.message);
    process.exit(1);
  }

  console.log(`SEED_OK: ${data?.length ?? 0} categories`);
}

main();
