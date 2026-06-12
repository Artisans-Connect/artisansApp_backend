import { supabaseAdmin } from "../src/config/supabase";

async function clearTable(tableName: string, filterColumn = "created_at") {
  console.log(`Clearing table: ${tableName}...`);
  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .not.is(filterColumn, null);

  if (error) {
    console.error(`Failed to clear table ${tableName}:`, error.message);
  } else {
    console.log(`Table ${tableName} cleared.`);
  }
}

async function deleteAuthUsers() {
  console.log("Fetching auth users to delete...");
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listError) {
    console.error("Failed to list auth users:", listError.message);
    return;
  }

  console.log(`Found ${users.length} auth users in Supabase.`);
  for (const user of users) {
    console.log(`Deleting auth user: ${user.email} (${user.id})...`);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(`Failed to delete user ${user.id}:`, deleteError.message);
    } else {
      console.log(`Deleted user ${user.email}.`);
    }
  }
}

async function main() {
  console.log("========================================");
  console.log("STARTING DATABASE CLEANUP");
  console.log("========================================");

  // 1. Clear transactional tables first to avoid foreign key violations
  await clearTable("messages");
  await clearTable("reviews");
  await clearTable("job_applications");
  await clearTable("job_dispatches");
  await clearTable("job_cancellations");
  await clearTable("job_completion_details");
  await clearTable("job_idempotency_keys");
  await clearTable("jobs");

  // 2. Clear verification-related tables
  await clearTable("verification_documents", "uploaded_at");
  await clearTable("verification_references");
  await clearTable("verification_audit_logs");
  await clearTable("verification_handoffs");
  await clearTable("worker_verifications");

  // 3. Clear notification-related tables
  await clearTable("notifications");
  await clearTable("notification_devices");

  // 4. Clear profiles and workers
  await clearTable("workers");
  await clearTable("profiles");

  // 5. Delete all auth users from Supabase Auth
  await deleteAuthUsers();

  console.log("========================================");
  console.log("DATABASE CLEANUP COMPLETE!");
  console.log("========================================");
}

main().catch(err => {
  console.error("Fatal error during cleanup:", err);
  process.exit(1);
});
