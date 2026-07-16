import { supabaseAdmin } from "../src/config/supabase";
import { categoryRows as rows } from "./seed-data/categories";

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
