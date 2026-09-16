import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../src/config/supabase";

async function checkColumns() {
  console.log("🔍 Checking database schema status...");

  const checks: Record<string, boolean> = {
    "jobs.job_archetype": false,
    "business_inquiries table": false,
    "worker_verifications.gnhr_verified": false,
    "worker_verifications.workshop_address": false,
    "workers.workshop_address": false,
  };

  // 1. Check jobs table
  const { error: jobErr } = await supabaseAdmin.from("jobs").select("id, job_archetype").limit(1);
  if (!jobErr) checks["jobs.job_archetype"] = true;

  // 2. Check business_inquiries table
  const { error: biErr } = await supabaseAdmin.from("business_inquiries").select("id").limit(1);
  if (!biErr) checks["business_inquiries table"] = true;

  // 3. Check worker_verifications GNHR & workshop columns
  const { error: wvErr } = await supabaseAdmin
    .from("worker_verifications")
    .select("id, gnhr_verified, workshop_address")
    .limit(1);
  if (!wvErr) {
    checks["worker_verifications.gnhr_verified"] = true;
    checks["worker_verifications.workshop_address"] = true;
  }

  // 4. Check workers workshop columns
  const { error: wErr } = await supabaseAdmin
    .from("workers")
    .select("id, workshop_address")
    .limit(1);
  if (!wErr) checks["workers.workshop_address"] = true;

  return checks;
}

async function runCategorySyncViaClient() {
  console.log("\n📦 Synchronizing 9 Ghanaian Categories and 53 Subcategories via Supabase SDK...");

  const categoryUpdates = [
    { slug: "construction_building", name: "Construction & Building", base_fee: 70 },
    { slug: "electrical_power", name: "Electrical & Power", base_fee: 80 },
    { slug: "plumbing_water", name: "Plumbing & Water Systems", base_fee: 60 },
    { slug: "auto_mechanical", name: "Auto & Mechanical Repairs", base_fee: 50 },
    { slug: "home_repairs", name: "Home Repairs & Maintenance", base_fee: 50 },
    { slug: "beauty_fashion", name: "Beauty, Fashion & Personal Services", base_fee: 40 },
    { slug: "electronics_it", name: "Electronics, Phones & IT Repairs", base_fee: 50 },
    { slug: "hospitality_events", name: "Hospitality & Event Services", base_fee: 100 },
    { slug: "arts_crafts", name: "Arts, Craft & Traditional Work", base_fee: 50 },
  ];

  for (const cat of categoryUpdates) {
    const { error } = await supabaseAdmin
      .from("categories")
      .update({ is_active: true, base_fee: cat.base_fee, name: cat.name })
      .eq("slug", cat.slug);
    if (error) {
      console.warn(`  ⚠️ Could not update category ${cat.slug}: ${error.message}`);
    }
  }

  // Re-activate subcategories
  const { data: activeCats } = await supabaseAdmin
    .from("categories")
    .select("id")
    .eq("is_active", true);

  if (activeCats && activeCats.length > 0) {
    const catIds = activeCats.map((c) => c.id);
    const { error: subErr } = await supabaseAdmin
      .from("subcategories")
      .update({ is_active: true })
      .in("category_id", catIds);
    if (!subErr) {
      console.log("  ✅ Re-activated subcategories under all active categories.");
    }
  }

  // Set specialized subcategory base fee overrides
  const subcategoryOverrides = [
    { slug: "solar_technician", base_fee: 150 },
    { slug: "generator_technician", base_fee: 120 },
    { slug: "heavy_equipment_mechanic", base_fee: 200 },
    { slug: "borehole_pump_technician", base_fee: 120 },
    { slug: "cctv_security_installer", base_fee: 100 },
    { slug: "welder_fabricator", base_fee: 80 },
    { slug: "roofer", base_fee: 60 },
    { slug: "phone_repairer", base_fee: 50 },
    { slug: "laptop_technician", base_fee: 50 },
    { slug: "barber", base_fee: 40 },
    { slug: "tailor_dressmaker", base_fee: 60 },
  ];

  for (const sub of subcategoryOverrides) {
    await supabaseAdmin
      .from("subcategories")
      .update({ base_fee: sub.base_fee })
      .eq("slug", sub.slug);
  }
  console.log("  ✅ Subcategory fee overrides updated.");
}

async function main() {
  console.log("=================================================================");
  console.log("       CRAFTMATCH BACKEND MIGRATION & INTEGRATION VERIFIER       ");
  console.log("=================================================================\n");

  const initialStatus = await checkColumns();
  console.log("\nCurrent Database Schema Status:");
  for (const [key, ok] of Object.entries(initialStatus)) {
    console.log(`  ${ok ? "✅ [PRESENT]" : "❌ [MISSING]"} ${key}`);
  }

  // Sync categories and subcategories
  await runCategorySyncViaClient();

  // Check if DDL migrations are still needed
  const needsDdl = Object.values(initialStatus).some((ok) => !ok);

  if (needsDdl) {
    console.log("\n-----------------------------------------------------------------");
    console.log("⚠️  DDL Schema Updates Required in Supabase Database:");
    console.log("   Since Supabase does not expose an unrestricted remote DDL runner,");
    console.log("   copy and paste the SQL below into your Supabase Dashboard SQL Editor:\n");

    const mig1Path = path.resolve(__dirname, "../supabase/migrations/20260915010000_enable_expanded_ghana_categories.sql");
    const mig2Path = path.resolve(__dirname, "../supabase/migrations/20260915020000_create_business_inquiries_and_gnhr_fields.sql");

    const sql1 = fs.existsSync(mig1Path) ? fs.readFileSync(mig1Path, "utf-8") : "";
    const sql2 = fs.existsSync(mig2Path) ? fs.readFileSync(mig2Path, "utf-8") : "";

    console.log("-- ====== 1. EXPANDED CATEGORIES & JOB ARCHETYPES ======");
    console.log(sql1);
    console.log("\n-- ====== 2. BUSINESS INQUIRIES & GNHR / WORKSHOP FIELDS ======");
    console.log(sql2);
    console.log("-----------------------------------------------------------------\n");
  } else {
    console.log("\n🎉 All required tables and columns are already present in the database!");
  }

  console.log("Migration check completed.");
}

main().catch((err) => {
  console.error("Migration runner error:", err);
  process.exit(1);
});
