-- 20260821180000_core_trade_specialization.sql
-- Specializes platform catalog to 4 core beachhead verticals:
-- 1. Plumbing & Water Systems (plumbing_water)
-- 2. Electrical & Power (electrical_power)
-- 3. Auto & Mechanical Repairs (auto_mechanical)
-- 4. Carpentry & Woodwork (construction_building -> Carpenter & Woodwork)

-- 1. Activate the 4 core beachhead categories and update descriptions / sort order
UPDATE categories
SET
  name = 'Plumbing & Water Systems',
  sort_order = 1,
  is_active = true
WHERE slug = 'plumbing_water';

UPDATE categories
SET
  name = 'Electrical & Power',
  sort_order = 2,
  is_active = true
WHERE slug = 'electrical_power';

UPDATE categories
SET
  name = 'Auto & Mechanical Repairs',
  sort_order = 3,
  is_active = true
WHERE slug = 'auto_mechanical';

UPDATE categories
SET
  name = 'Carpentry & Woodwork',
  description = 'Furniture making, doors, cabinets, formwork, and roofing woodwork',
  sort_order = 4,
  is_active = true
WHERE slug = 'construction_building';

-- 2. Deactivate remaining non-core categories
UPDATE categories
SET is_active = false
WHERE slug IN (
  'home_repairs',
  'beauty_fashion',
  'electronics_it',
  'hospitality_events',
  'arts_crafts'
);

-- 3. Deactivate subcategories under inactive categories
UPDATE subcategories
SET is_active = false
WHERE category_id IN (
  SELECT id FROM categories WHERE is_active = false
);

-- 4. In construction_building, keep Carpenter active and deactivate non-carpentry subcategories for beachhead focus
UPDATE subcategories
SET is_active = true
WHERE slug = 'carpenter'
  AND category_id = (SELECT id FROM categories WHERE slug = 'construction_building' LIMIT 1);

UPDATE subcategories
SET is_active = false
WHERE slug IN ('mason', 'tiler', 'painter', 'steel_bender', 'welder_fabricator', 'ceiling_installer', 'glass_worker', 'roofer', 'paver_landscaper')
  AND category_id = (SELECT id FROM categories WHERE slug = 'construction_building' LIMIT 1);

-- 5. Ensure core subcategories under active categories are active
UPDATE subcategories
SET is_active = true
WHERE category_id IN (
  SELECT id FROM categories WHERE slug IN ('plumbing_water', 'electrical_power', 'auto_mechanical')
);
