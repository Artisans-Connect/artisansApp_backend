import { supabaseAdmin } from "../src/config/supabase";
import { demoWorkers as workersToSeed } from "./seed-data/workers";

async function main() {
  console.log("Starting worker seeding...");

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error("Failed to list users:", listError.message);
    process.exit(1);
  }

  for (const worker of workersToSeed) {
    console.log(`Seeding worker: ${worker.full_name} (${worker.email})`);

    const existing = users.find((u) => u.email === worker.email);
    let userId: string;

    if (existing) {
      console.log(`User already exists in auth.users with ID: ${existing.id}`);
      userId = existing.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: worker.email,
        password: worker.password,
        email_confirm: true,
        user_metadata: { role: "worker" },
      });

      if (authError) {
        console.error(`Failed to create auth user for ${worker.email}:`, authError.message);
        continue;
      }
      userId = authData.user.id;
      console.log(`Created new auth user with ID: ${userId}`);
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: worker.full_name,
      phone: worker.phone,
      signup_type: "worker",
      last_active_mode: "worker",
      avatar_url: worker.avatar_url,
      bio: worker.bio,
      location_label: worker.location_label,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.error(`Failed to seed profile for ${worker.full_name}:`, profileError.message);
      continue;
    }
    console.log("Profile seeded successfully.");

    const { error: workerError } = await supabaseAdmin.from("workers").upsert({
      id: userId,
      skills: worker.skills,
      hourly_rate: worker.hourly_rate,
      rate_type: "hourly",
      is_available: worker.is_available ?? true,
      is_verified: true,
      current_lat: worker.current_lat,
      current_lng: worker.current_lng,
      location_at: new Date().toISOString(),
      rating: worker.rating,
      total_jobs: worker.total_jobs,
      service_areas: worker.service_areas,
      experience_band: worker.experience_band,
      updated_at: new Date().toISOString(),
    });

    if (workerError) {
      console.error(`Failed to seed worker record for ${worker.full_name}:`, workerError.message);
      continue;
    }
    console.log("Worker details seeded successfully.");

    const { data: existingVerification } = await supabaseAdmin
      .from("worker_verifications")
      .select("id")
      .eq("worker_id", userId)
      .maybeSingle();

    const years =
      worker.experience_band === "senior" ? 10 : worker.experience_band === "mid" ? 5 : 2;

    const verificationPayload = {
      status: "approved",
      verification_level: "professional",
      full_name: worker.full_name,
      phone_number: worker.phone,
      email: worker.email,
      trade_category: worker.skills[0],
      years_of_experience: years,
      current_region: "Ashanti",
      current_city: "Kumasi",
      confidence_score: 95,
      updated_at: new Date().toISOString(),
    };

    if (existingVerification) {
      const { error: updateVerError } = await supabaseAdmin
        .from("worker_verifications")
        .update(verificationPayload)
        .eq("id", existingVerification.id);

      if (updateVerError) {
        console.error(`Failed to update verification for ${worker.full_name}:`, updateVerError.message);
      } else {
        console.log("Worker verification updated.");
      }
    } else {
      const { error: insertVerError } = await supabaseAdmin.from("worker_verifications").insert({
        worker_id: userId,
        ...verificationPayload,
        submitted_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      });

      if (insertVerError) {
        console.error(`Failed to create verification for ${worker.full_name}:`, insertVerError.message);
      } else {
        console.log("Worker verification created.");
      }
    }
  }

  console.log("Worker seeding complete!");
}

main().catch((err) => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
