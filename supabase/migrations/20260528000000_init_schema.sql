-- 1. Create Enums
CREATE TYPE role AS ENUM ('client', 'worker');
CREATE TYPE job_status AS ENUM ('draft', 'searching', 'matching', 'matched', 'in_progress', 'completed', 'cancelled', 'expired');
CREATE TYPE job_mode AS ENUM ('asap', 'scheduled', 'flexible');
CREATE TYPE budget_type AS ENUM ('fixed', 'range', 'negotiable');
CREATE TYPE service_type AS ENUM ('home_visit', 'remote', 'either');
CREATE TYPE job_application_status AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');
CREATE TYPE rate_type AS ENUM ('hourly', 'fixed');

-- 2. Create Profiles Table (Linked to auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  avatar_url text,
  role role,
  fcm_token text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Create Workers Table
CREATE TABLE workers (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  skills text[] DEFAULT '{}',
  hourly_rate numeric(10,2),
  rate_type rate_type DEFAULT 'hourly',
  is_available boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  current_lat numeric(9,6),
  current_lng numeric(9,6),
  location_at timestamptz,
  rating numeric(3,2) DEFAULT 0,
  total_jobs integer DEFAULT 0,
  service_areas text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers can view their own worker profile" ON workers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Workers can update their own worker profile" ON workers FOR UPDATE USING (auth.uid() = id);

-- 4. Create Categories Table
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  icon_name text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active categories" ON categories FOR SELECT USING (is_active = true);

-- 5. Create Jobs Table
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES profiles(id),
  worker_id uuid REFERENCES profiles(id),
  category_id uuid REFERENCES categories(id),
  title text NOT NULL,
  description text NOT NULL,
  photo_urls text[] DEFAULT '{}',
  location_lat numeric(9,6),
  location_lng numeric(9,6),
  address_label text,
  status job_status DEFAULT 'draft',
  job_mode job_mode NOT NULL,
  budget_type budget_type NOT NULL,
  budget_fixed numeric(10,2),
  budget_min numeric(10,2),
  budget_max numeric(10,2),
  scheduled_for timestamptz,
  expires_at timestamptz,
  service_type service_type NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients can view their own jobs" ON jobs FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Workers can view jobs assigned to them" ON jobs FOR SELECT USING (auth.uid() = worker_id);
-- (Node backend will insert/update using service_role)

-- 6. Create Job Applications Table
CREATE TABLE job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message text,
  proposed_rate numeric(10,2),
  status job_application_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers can view their own applications" ON job_applications FOR SELECT USING (auth.uid() = worker_id);
CREATE POLICY "Clients can view applications for their jobs" ON job_applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.client_id = auth.uid())
);

-- 7. Create Reviews Table
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES profiles(id),
  worker_id uuid REFERENCES profiles(id),
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Clients can create reviews for their jobs" ON reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- 8. Create Messages Table
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES profiles(id),
  content text NOT NULL,
  image_urls text[] DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- Participants of a job can view messages
CREATE POLICY "Job participants can view messages" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = messages.job_id 
      AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
  )
);
-- Participants of a job can send messages
CREATE POLICY "Job participants can insert messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = messages.job_id 
      AND (jobs.client_id = auth.uid() OR jobs.worker_id = auth.uid())
  )
);
