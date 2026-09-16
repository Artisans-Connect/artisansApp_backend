-- 20260915010000_enable_expanded_ghana_categories.sql
-- Reactivate all 9 canonical parent categories and all 53 subcategories with realistic Ghanaian base fees.
-- Add adaptive job archetype columns and expand service_type enum for workshop & pickup delivery modes.

-- 1. Re-activate and ensure proper names, descriptions, and sort orders for all 9 categories
UPDATE categories
SET
  name = 'Construction & Building',
  description = 'House building, masonry, carpentry, roofing, and metal works',
  sort_order = 1,
  is_active = true,
  base_fee = 70.00
WHERE slug = 'construction_building';

UPDATE categories
SET
  name = 'Electrical & Power',
  description = 'Wiring, solar panels, appliance repair, and backup generators',
  sort_order = 2,
  is_active = true,
  base_fee = 80.00
WHERE slug = 'electrical_power';

UPDATE categories
SET
  name = 'Plumbing & Water Systems',
  description = 'Pipes, boreholes, water pump setup, and drainage repairs',
  sort_order = 3,
  is_active = true,
  base_fee = 60.00
WHERE slug = 'plumbing_water';

UPDATE categories
SET
  name = 'Auto & Mechanical Repairs',
  description = 'Vehicle mechanic, spraying, auto body repair, and motorbikes',
  sort_order = 4,
  is_active = true,
  base_fee = 50.00
WHERE slug = 'auto_mechanical';

UPDATE categories
SET
  name = 'Home Repairs & Maintenance',
  description = 'General handyman, furniture fixes, window lock repairs, and cleaning',
  sort_order = 5,
  is_active = true,
  base_fee = 50.00
WHERE slug = 'home_repairs';

UPDATE categories
SET
  name = 'Beauty, Fashion & Personal Services',
  description = 'Hairdressing, barbering, makeup, tailoring, and traditional accessories',
  sort_order = 6,
  is_active = true,
  base_fee = 40.00
WHERE slug = 'beauty_fashion';

UPDATE categories
SET
  name = 'Electronics, Phones & IT Repairs',
  description = 'Phone screen replacement, laptops, TV, and printer setups',
  sort_order = 7,
  is_active = true,
  base_fee = 50.00
WHERE slug = 'electronics_it';

UPDATE categories
SET
  name = 'Hospitality & Event Services',
  description = 'Catering, events cake baking, decorators, and photo/video setups',
  sort_order = 8,
  is_active = true,
  base_fee = 100.00
WHERE slug = 'hospitality_events';

UPDATE categories
SET
  name = 'Arts, Craft & Traditional Work',
  description = 'Pottery, Kente weaving, woodcarving, drums, and custom jewellers',
  sort_order = 9,
  is_active = true,
  base_fee = 50.00
WHERE slug = 'arts_crafts';

-- 2. Reactivate ALL subcategories under active parent categories
UPDATE subcategories
SET is_active = true
WHERE category_id IN (
  SELECT id FROM categories WHERE is_active = true
);

-- 3. Set specialized subcategory base fee overrides (GHS)
UPDATE subcategories SET base_fee = 150 WHERE slug = 'solar_technician';
UPDATE subcategories SET base_fee = 120 WHERE slug = 'generator_technician';
UPDATE subcategories SET base_fee = 200 WHERE slug = 'heavy_equipment_mechanic';
UPDATE subcategories SET base_fee = 120 WHERE slug = 'borehole_pump_technician';
UPDATE subcategories SET base_fee = 100 WHERE slug = 'cctv_security_installer';
UPDATE subcategories SET base_fee = 80 WHERE slug = 'welder_fabricator';
UPDATE subcategories SET base_fee = 60 WHERE slug = 'roofer';
UPDATE subcategories SET base_fee = 50 WHERE slug = 'phone_repairer';
UPDATE subcategories SET base_fee = 50 WHERE slug = 'laptop_technician';
UPDATE subcategories SET base_fee = 40 WHERE slug = 'barber';
UPDATE subcategories SET base_fee = 60 WHERE slug = 'tailor_dressmaker';

-- 4. Expand service_type enum to include 'workshop' and 'pickup_delivery'
DO $$
BEGIN
  ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'workshop';
  ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'pickup_delivery';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Add adaptive job archetype and context columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_archetype text DEFAULT 'fixed_scope';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS diagnostic_fee numeric(10,2) NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS milestone_stages jsonb NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS landmark_description text NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archetype_payload jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_job_archetype ON jobs(job_archetype);
