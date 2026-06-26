import { supabaseAdmin } from "../src/config/supabase";

async function run() {
  console.log("Starting User Database Data Cleanup...");

  try {
    // 1. Fetch admin user IDs to preserve them
    console.log("Fetching admin users to protect from deletion...");
    const { data: admins, error: adminErr } = await supabaseAdmin
      .from("admin_users")
      .select("user_id");

    if (adminErr) {
      console.error("Error fetching admins:", adminErr.message);
      process.exit(1);
    }

    const adminUserIds = new Set((admins ?? []).map(a => a.user_id).filter(Boolean));
    console.log(`Protected Admin User IDs: ${Array.from(adminUserIds).join(", ") || 'None'}`);

    // 2. Fetch all profiles to find which ones to delete
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role");

    if (profileErr) {
      console.error("Error fetching profiles:", profileErr.message);
      process.exit(1);
    }

    const usersToDelete = (profiles ?? []).filter(p => !adminUserIds.has(p.id));
    const userIdsToDelete = usersToDelete.map(u => u.id);

    console.log(`Found ${profiles?.length} profiles total.`);
    console.log(`Found ${userIdsToDelete.length} non-admin user profiles to delete.`);

    if (userIdsToDelete.length === 0) {
      console.log("No user data to clean up. Database is already clean!");
      process.exit(0);
    }

    // 3. Delete transactional data in correct constraint dependency order
    console.log("Deleting verification audit logs...");
    await supabaseAdmin
      .from("verification_audit_logs")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting verification documents...");
    await supabaseAdmin
      .from("verification_documents")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting verification references...");
    await supabaseAdmin
      .from("verification_references")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting verification handoffs...");
    await supabaseAdmin
      .from("verification_handoffs")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting worker verifications...");
    await supabaseAdmin
      .from("worker_verifications")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting chat messages...");
    await supabaseAdmin
      .from("messages")
      .delete()
      .in("sender_id", userIdsToDelete);

    console.log("Deleting reviews...");
    await supabaseAdmin
      .from("reviews")
      .delete()
      .in("reviewer_id", userIdsToDelete);

    await supabaseAdmin
      .from("reviews")
      .delete()
      .in("worker_id", userIdsToDelete);

    console.log("Deleting job applications...");
    await supabaseAdmin
      .from("job_applications")
      .delete()
      .in("worker_id", userIdsToDelete);

    // Jobs might be linked to other tables, so clear them next
    console.log("Deleting jobs...");
    await supabaseAdmin
      .from("jobs")
      .delete()
      .in("client_id", userIdsToDelete);

    await supabaseAdmin
      .from("jobs")
      .delete()
      .in("worker_id", userIdsToDelete);

    // 4. Delete profile extensions (workers)
    console.log("Deleting worker profiles...");
    await supabaseAdmin
      .from("workers")
      .delete()
      .in("id", userIdsToDelete);

    // 5. Delete profiles
    console.log("Deleting user profiles...");
    const { error: deleteProfilesErr } = await supabaseAdmin
      .from("profiles")
      .delete()
      .in("id", userIdsToDelete);

    if (deleteProfilesErr) {
      console.error("Error deleting profiles:", deleteProfilesErr.message);
    }

    // 6. Delete users from Supabase Auth so they can register again
    console.log("Deleting users from Supabase Auth...");
    for (const userId of userIdsToDelete) {
      const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteErr) {
        console.warn(`Warning: Failed to delete auth user ${userId}:`, authDeleteErr.message);
      } else {
        console.log(`Deleted auth user: ${userId}`);
      }
    }

    console.log("--------------------------------------------------");
    console.log("Preserved tables (Critical app data):");
    console.log("- categories (Service categories/L1)");
    console.log("- subcategories (Service subcategories/L2/L3)");
    console.log("- admin_users (Verification Portal admin accounts)");
    console.log("--------------------------------------------------");
    console.log("User Database Data Cleanup completed successfully!");
  } catch (error: any) {
    console.error("Cleanup failed with exception:", error.message || error);
    process.exit(1);
  }
}

run();
