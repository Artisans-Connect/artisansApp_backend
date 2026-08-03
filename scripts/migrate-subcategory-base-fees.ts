import { supabaseAdmin } from "../src/config/supabase";

/**
 * Migration script: Add base_fee column to subcategories table and seed
 * initial values for specialized high-value trade subcategories.
 *
 * This uses supabaseAdmin.rpc to run raw SQL since the Supabase JS client
 * doesn't support ALTER TABLE directly. We fall back to a workaround:
 * try updating first; if the column doesn't exist, we ask the user to run
 * the ALTER TABLE in Supabase SQL editor, then re-run this script for seeds.
 */

const SEED_BASE_FEES: Array<{ slug: string; base_fee: number }> = [
  { slug: "solar_technician", base_fee: 150 },
  { slug: "generator_technician", base_fee: 120 },
  { slug: "heavy_equipment_mechanic", base_fee: 200 },
  { slug: "borehole_pump_technician", base_fee: 120 },
  { slug: "cctv_security_installer", base_fee: 100 },
];

async function addColumnIfNeeded(): Promise<boolean> {
  // Try a harmless read to see if the column exists
  const { error } = await supabaseAdmin
    .from("subcategories")
    .select("base_fee")
    .limit(1);

  if (error && error.message.includes("base_fee")) {
    console.log("Column 'base_fee' does not exist on 'subcategories'.");
    console.log("Running ALTER TABLE via Supabase rpc...");

    // Use rpc to run raw SQL — requires a Postgres function or direct SQL
    // Since supabaseAdmin can't run raw DDL, we'll attempt via the REST
    // endpoint for SQL. If this fails, we provide the SQL for manual run.
    const alterSql = `ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS base_fee integer NULL CHECK (base_fee >= 0);`;

    // Try using the /rest/v1/rpc endpoint if a helper function exists
    const { error: rpcError } = await supabaseAdmin.rpc("exec_sql", {
      query: alterSql,
    });

    if (rpcError) {
      console.log("\n⚠️  Cannot run ALTER TABLE automatically via supabaseAdmin.");
      console.log("   Please run this SQL in the Supabase SQL Editor first:\n");
      console.log(`   ${alterSql}\n`);
      console.log("   Then re-run this script to seed the base_fee values.");
      return false;
    }

    console.log("✅ Column 'base_fee' added to 'subcategories' table.");
    return true;
  }

  console.log("✅ Column 'base_fee' already exists on 'subcategories'.");
  return true;
}

async function seedBaseFees(): Promise<void> {
  console.log("\nSeeding subcategory base fee overrides...\n");

  let successCount = 0;
  let skipCount = 0;

  for (const item of SEED_BASE_FEES) {
    // Check if subcategory exists first
    const { data: existing } = await supabaseAdmin
      .from("subcategories")
      .select("id, name, base_fee")
      .eq("slug", item.slug)
      .maybeSingle();

    if (!existing) {
      console.log(`  ⏭  Skipped "${item.slug}" — subcategory not found in database`);
      skipCount++;
      continue;
    }

    if (existing.base_fee != null && Number(existing.base_fee) === item.base_fee) {
      console.log(`  ✓  "${existing.name}" (${item.slug}) already has base_fee = GH₵ ${item.base_fee}`);
      skipCount++;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("subcategories")
      .update({ base_fee: item.base_fee })
      .eq("slug", item.slug);

    if (error) {
      console.error(`  ✗  Failed to update "${item.slug}": ${error.message}`);
    } else {
      console.log(`  ✅ "${existing.name}" (${item.slug}) → GH₵ ${item.base_fee} base fee`);
      successCount++;
    }
  }

  console.log(`\nDone: ${successCount} updated, ${skipCount} skipped.`);
}

async function verifyResults(): Promise<void> {
  console.log("\n--- Verification: All subcategories with custom base_fee ---\n");

  const { data, error } = await supabaseAdmin
    .from("subcategories")
    .select("name, slug, base_fee, category_id, categories(name, base_fee)")
    .not("base_fee", "is", null)
    .order("base_fee", { ascending: false });

  if (error) {
    console.error("Could not verify:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("  No subcategories have custom base_fee set.");
    return;
  }

  for (const row of data) {
    const cat = (row as any).categories;
    const catName = cat?.name ?? "Unknown";
    const catFee = cat?.base_fee ?? 60;
    console.log(
      `  ${row.name} (${row.slug}): GH₵ ${row.base_fee} base | Parent: ${catName} @ GH₵ ${catFee}`
    );
  }

  console.log(`\n  Total subcategories with custom base_fee: ${data.length}`);
}

async function main() {
  console.log("=== Subcategory Base Fee Migration Script ===\n");

  const columnReady = await addColumnIfNeeded();
  if (!columnReady) {
    process.exit(1);
  }

  await seedBaseFees();
  await verifyResults();

  console.log("\n=== Migration complete ===");
}

main().catch((err) => {
  console.error("Migration script error:", err);
  process.exit(1);
});
