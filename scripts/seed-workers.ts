import { supabaseAdmin } from "../src/config/supabase";

interface DemoWorker {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  skills: string[];
  hourly_rate: number;
  is_available: boolean;
  current_lat: number;
  current_lng: number;
  rating: number;
  total_jobs: number;
  service_areas: string[];
  experience_band: "junior" | "mid" | "senior";
  bio: string;
  location_label: string;
  avatar_url?: string;
}

interface ModeratedUser {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: "worker" | "client";
  skills?: string[];
  account_status: "suspended" | "warned";
  suspension_reason: string;
  location_label: string;
  bio?: string;
}

const workersToSeed: DemoWorker[] = [
  {
    email: "kwasi.plumber@craftmatch.com",
    password: "Password123!",
    full_name: "Kwasi Mensah",
    phone: "+233241234567",
    skills: ["Plumber", "Plumbing", "leakages", "drainage"],
    hourly_rate: 50,
    is_available: true,
    current_lat: 6.6730,
    current_lng: -1.5650,
    rating: 4.9,
    total_jobs: 48,
    service_areas: ["KNUST Campus", "Ayigya", "Bomso", "Kotei", "Kentinkrono", "Ayeduase"],
    experience_band: "senior",
    bio: "Licensed master plumber with over 10 years experience solving leaks, pipe bursts, and drainage issues across KNUST campus and surrounding areas.",
    location_label: "KNUST Campus, Kumasi",
    avatar_url: "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400&auto=format&fit=crop&q=80",
  },
  {
    email: "abena.spark@craftmatch.com",
    password: "Password123!",
    full_name: "Abena Osei",
    phone: "+233242234567",
    skills: ["Electrician", "Electrical", "wiring", "lighting"],
    hourly_rate: 55,
    is_available: true,
    current_lat: 6.6850,
    current_lng: -1.5600,
    rating: 4.8,
    total_jobs: 39,
    service_areas: ["Ayigya", "Kentinkrono", "KNUST Campus", "Bomso", "Boadi"],
    experience_band: "senior",
    bio: "Certified electrical contractor specializing in domestic wiring, socket repair, lighting setup, and solar systems.",
    location_label: "Ayigya / Kentinkrono, Kumasi",
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
  },
  {
    email: "kofi.wood@craftmatch.com",
    password: "Password123!",
    full_name: "Kofi Boateng",
    phone: "+233243234567",
    skills: ["Carpenter", "Carpentry", "woodwork", "furniture"],
    hourly_rate: 45,
    is_available: true,
    current_lat: 6.6620,
    current_lng: -1.5790,
    rating: 4.7,
    total_jobs: 32,
    service_areas: ["Kotei", "Bomso", "KNUST Campus", "Ayeduase", "Boadi"],
    experience_band: "mid",
    bio: "Experienced carpenter for custom furniture, cabinet fitting, door locks, roofing woodwork, and general repairs.",
    location_label: "Kotei / Bomso, Kumasi",
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
  },
  {
    email: "kofi.auto@craftmatch.com",
    password: "Password123!",
    full_name: "Kofi Mensah (Auto)",
    phone: "+233243112233",
    skills: ["Auto Mechanic", "diagnostics", "brakes", "engine"],
    hourly_rate: 60,
    is_available: true,
    current_lat: 6.6748,
    current_lng: -1.5677,
    rating: 4.9,
    total_jobs: 54,
    service_areas: ["KNUST Campus", "Ayigya", "Bomso", "Kotei", "Ayeduase", "Kumasi Central"],
    experience_band: "senior",
    bio: "Master vehicle diagnostic mechanic specializing in Japanese and European vehicles, emergency roadside assistance.",
    location_label: "KNUST Commercial Area, Kumasi",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
  },
  {
    email: "esi.electro@craftmatch.com",
    password: "Password123!",
    full_name: "Esi Dankwah",
    phone: "+233250234567",
    skills: ["Electrician", "Electrical", "lighting", "appliances"],
    hourly_rate: 40,
    is_available: false,
    current_lat: 6.6548,
    current_lng: -1.5488,
    rating: 4.6,
    total_jobs: 21,
    service_areas: ["Boadi", "Kotei", "Ayeduase", "KNUST Campus"],
    experience_band: "mid",
    bio: "Professional lighting and domestic appliance technician. Specializes in emergency repairs.",
    location_label: "Boadi, Kumasi",
    avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
  },
];

const moderatedUsers: ModeratedUser[] = [
  {
    email: "kweku.baidoo@craftmatch.com",
    password: "Password123!",
    full_name: "Kweku Baidoo",
    phone: "+233244111222",
    role: "worker",
    skills: ["Electrician", "wiring"],
    account_status: "suspended",
    suspension_reason: "Repeated off-platform payment demands and failure to honor service safety standards.",
    location_label: "Ayigya, Kumasi",
    bio: "Electrical installer and repairer.",
  },
  {
    email: "kwabena.donkor@craftmatch.com",
    password: "Password123!",
    full_name: "Kwabena Donkor",
    phone: "+233244333444",
    role: "worker",
    skills: ["Plumber", "plumbing"],
    account_status: "suspended",
    suspension_reason: "Gross negligence during plumbing installation and no-show for rectification visits.",
    location_label: "Bomso, Kumasi",
    bio: "Domestic plumbing technician.",
  },
  {
    email: "afia.pokuaa@craftmatch.com",
    password: "Password123!",
    full_name: "Afia Pokuaa",
    phone: "+233244555666",
    role: "client",
    account_status: "suspended",
    suspension_reason: "Abusive conduct toward artisans and repeated payment disputes after verified completion.",
    location_label: "KNUST Campus, Kumasi",
  },
  {
    email: "yaa.opoku@craftmatch.com",
    password: "Password123!",
    full_name: "Yaa Asantewaa Opoku",
    phone: "+233244777888",
    role: "client",
    account_status: "suspended",
    suspension_reason: "Fraudulent damage claims and harassing behavior violating platform safety standards.",
    location_label: "Kotei, Kumasi",
  },
];

async function main() {
  console.log("Starting worker and user seeding...");

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
      account_status: "active",
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

  // Seed Moderated / Suspended Accounts
  console.log("Seeding moderated dummy accounts...");
  for (const modUser of moderatedUsers) {
    console.log(`Seeding moderated user: ${modUser.full_name} (${modUser.email})`);

    const existing = users.find((u) => u.email === modUser.email);
    let userId: string;

    if (existing) {
      userId = existing.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: modUser.email,
        password: modUser.password,
        email_confirm: true,
        user_metadata: { role: modUser.role },
      });

      if (authError) {
        console.error(`Failed to create auth user for ${modUser.email}:`, authError.message);
        continue;
      }
      userId = authData.user.id;
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: modUser.full_name,
      phone: modUser.phone,
      signup_type: modUser.role,
      last_active_mode: modUser.role,
      bio: modUser.bio,
      location_label: modUser.location_label,
      account_status: modUser.account_status,
      suspension_reason: modUser.suspension_reason,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.error(`Failed to seed profile for ${modUser.full_name}:`, profileError.message);
      continue;
    }

    if (modUser.role === "worker" && modUser.skills) {
      await supabaseAdmin.from("workers").upsert({
        id: userId,
        skills: modUser.skills,
        is_available: false,
        is_verified: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log("Worker and user seeding complete!");
}

main().catch((err) => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
