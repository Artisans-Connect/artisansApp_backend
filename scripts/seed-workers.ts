import { supabaseAdmin } from "../src/config/supabase";

const workersToSeed = [
  {
    email: "kwasi.plumber@craftmatch.com",
    password: "Password123!",
    full_name: "Kwasi Mensah",
    phone: "+233241234567",
    avatar_url: "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=200",
    bio: "Experienced plumber with 8+ years in home maintenance and leakage repair.",
    location_label: "KNUST Campus, Kumasi",
    skills: ["plumbing", "plumber", "leakage"],
    hourly_rate: 65.0,
    current_lat: 6.6730,
    current_lng: -1.5650,
    rating: 4.8,
    total_jobs: 24,
    service_areas: ["KNUST Campus", "Ayigya", "Bomso"],
    experience_band: "mid"
  },
  {
    email: "abena.spark@craftmatch.com",
    password: "Password123!",
    full_name: "Abena Osei",
    phone: "+233242234567",
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
    bio: "Certified electrician specializing in industrial wiring and appliance repair.",
    location_label: "Ayigya, Kumasi",
    skills: ["electrical", "electrician", "wiring"],
    hourly_rate: 75.0,
    current_lat: 6.6850,
    current_lng: -1.5600,
    rating: 4.9,
    total_jobs: 38,
    service_areas: ["Ayigya", "Kentinkrono", "KNUST"],
    experience_band: "senior"
  },
  {
    email: "kofi.wood@craftmatch.com",
    password: "Password123!",
    full_name: "Kofi Boateng",
    phone: "+233243234567",
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    bio: "Furniture maker and carpenter. High-quality woodwork and cabinet installations.",
    location_label: "Kotei, Kumasi",
    skills: ["carpentry", "carpenter", "woodwork"],
    hourly_rate: 55.0,
    current_lat: 6.6620,
    current_lng: -1.5790,
    rating: 4.7,
    total_jobs: 19,
    service_areas: ["Kotei", "Bomso", "KNUST"],
    experience_band: "mid"
  },
  {
    email: "ama.clean@craftmatch.com",
    password: "Password123!",
    full_name: "Ama Serwaa",
    phone: "+233244234567",
    avatar_url: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=200",
    bio: "Professional cleaner offering deep cleaning services for offices and residences.",
    location_label: "Ayeduase, Kumasi",
    skills: ["cleaning", "cleaner", "deep clean"],
    hourly_rate: 40.0,
    current_lat: 6.6705,
    current_lng: -1.5830,
    rating: 4.6,
    total_jobs: 45,
    service_areas: ["Ayeduase", "KNUST Campus", "Oforikrom"],
    experience_band: "senior"
  },
  {
    email: "yaw.painter@craftmatch.com",
    password: "Password123!",
    full_name: "Yaw Addo",
    phone: "+233245234567",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
    bio: "Expert wall painter and surface decorator. Interior and exterior painting.",
    location_label: "Oforikrom, Kumasi",
    skills: ["painting", "painter", "paint"],
    hourly_rate: 50.0,
    current_lat: 6.6820,
    current_lng: -1.5950,
    rating: 4.5,
    total_jobs: 11,
    service_areas: ["Oforikrom", "Bomso", "KNUST"],
    experience_band: "junior"
  }
];

async function main() {
  console.log("Starting worker seeding...");

  // 1. Fetch all existing users from Supabase auth admin list
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error("Failed to list users:", listError.message);
    process.exit(1);
  }

  for (const worker of workersToSeed) {
    console.log(`Seeding worker: ${worker.full_name} (${worker.email})`);
    
    // Find or create auth user
    const existing = users.find(u => u.email === worker.email);
    let userId: string;

    if (existing) {
      console.log(`User already exists in auth.users with ID: ${existing.id}`);
      userId = existing.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: worker.email,
        password: worker.password,
        email_confirm: true,
        user_metadata: { role: "worker" }
      });

      if (authError) {
        console.error(`Failed to create auth user for ${worker.email}:`, authError.message);
        continue;
      }
      userId = authData.user.id;
      console.log(`Created new auth user with ID: ${userId}`);
    }

    // Create/Upsert Profile record
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: worker.full_name,
      phone: worker.phone,
      signup_type: "worker",
      last_active_mode: "worker",
      avatar_url: worker.avatar_url,
      bio: worker.bio,
      location_label: worker.location_label,
      updated_at: new Date().toISOString()
    });

    if (profileError) {
      console.error(`Failed to seed profile for ${worker.full_name}:`, profileError.message);
      continue;
    }
    console.log(`Profile seeded successfully.`);

    // Create/Upsert Worker record
    const { error: workerError } = await supabaseAdmin.from("workers").upsert({
      id: userId,
      skills: worker.skills,
      hourly_rate: worker.hourly_rate,
      rate_type: "hourly",
      is_available: true,
      is_verified: true,
      current_lat: worker.current_lat,
      current_lng: worker.current_lng,
      location_at: new Date().toISOString(),
      rating: worker.rating,
      total_jobs: worker.total_jobs,
      service_areas: worker.service_areas,
      experience_band: worker.experience_band,
      updated_at: new Date().toISOString()
    });

    if (workerError) {
      console.error(`Failed to seed worker record for ${worker.full_name}:`, workerError.message);
      continue;
    }
    console.log(`Worker details seeded successfully.`);

    // Create/Update Worker Verification record
    const { data: existingVerification } = await supabaseAdmin
      .from("worker_verifications")
      .select("id")
      .eq("worker_id", userId)
      .maybeSingle();

    if (existingVerification) {
      const { error: updateVerError } = await supabaseAdmin
        .from("worker_verifications")
        .update({
          status: "approved",
          verification_level: "professional",
          full_name: worker.full_name,
          phone_number: worker.phone,
          email: worker.email,
          trade_category: worker.skills[0],
          years_of_experience: worker.experience_band === "senior" ? 10 : (worker.experience_band === "mid" ? 5 : 2),
          current_region: "Ashanti",
          current_city: "Kumasi",
          confidence_score: 95,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingVerification.id);

      if (updateVerError) {
        console.error(`Failed to update verification for ${worker.full_name}:`, updateVerError.message);
      } else {
        console.log(`Worker verification updated.`);
      }
    } else {
      const { error: insertVerError } = await supabaseAdmin
        .from("worker_verifications")
        .insert({
          worker_id: userId,
          status: "approved",
          verification_level: "professional",
          full_name: worker.full_name,
          phone_number: worker.phone,
          email: worker.email,
          trade_category: worker.skills[0],
          years_of_experience: worker.experience_band === "senior" ? 10 : (worker.experience_band === "mid" ? 5 : 2),
          current_region: "Ashanti",
          current_city: "Kumasi",
          confidence_score: 95,
          submitted_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString()
        });

      if (insertVerError) {
        console.error(`Failed to create verification for ${worker.full_name}:`, insertVerError.message);
      } else {
        console.log(`Worker verification created.`);
      }
    }
  }

  console.log("Worker seeding complete!");
}

main().catch(err => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
