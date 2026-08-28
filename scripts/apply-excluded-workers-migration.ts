import { supabaseAdmin } from "../src/config/supabase";

async function main() {
  console.log("Applying excluded_worker_ids migration to Supabase...");

  const alterSql = `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS excluded_worker_ids uuid[] DEFAULT '{}';`;
  const indexSql = `CREATE INDEX IF NOT EXISTS idx_jobs_excluded_workers ON jobs USING GIN (excluded_worker_ids);`;

  console.log("Running SQL query via RPC...");
  
  const { error: rpcError } = await supabaseAdmin.rpc("exec_sql", {
    query: `${alterSql}\n${indexSql}`,
  });

  if (rpcError) {
    console.error("\n⚠️  Cannot run migration SQL automatically via RPC. Error:", rpcError.message);
    console.log("   Please run this SQL in the Supabase SQL Editor manually:\n");
    console.log(`   ${alterSql}`);
    console.log(`   ${indexSql}\n`);
    process.exit(1);
  }

  console.log("✅ Column 'excluded_worker_ids' and GIN index successfully verified/added to 'jobs' table.");
}

main().catch((err) => {
  console.error("Migration script error:", err);
  process.exit(1);
});
