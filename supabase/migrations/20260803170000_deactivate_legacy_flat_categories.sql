-- 20260803170000_deactivate_legacy_flat_categories.sql
-- Deactivate and clean up legacy flat category rows in Supabase.
-- Ensures only the 9 canonical parent categories remain active as top-level categories.

-- 1. Re-assign any subcategories linked to legacy categories over to their parent categories if needed
UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'plumbing_water' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('plumbing'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'electrical_power' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('electrical', 'appliance_repair', 'security'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'construction_building' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('carpentry', 'masonry', 'welding', 'construction', 'painting', 'tiling', 'roofing'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'auto_mechanical' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('automotive'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'home_repairs' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('hvac', 'cleaning', 'landscaping', 'upholstery'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'beauty_fashion' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'beauty'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'hospitality_events' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('catering'));

UPDATE subcategories
SET category_id = (SELECT id FROM categories WHERE slug = 'electronics_it' LIMIT 1)
WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('ict_support'));

-- 2. Delete legacy flat categories
DELETE FROM categories
WHERE slug IN (
  'plumbing',
  'electrical',
  'carpentry',
  'masonry',
  'welding',
  'construction',
  'automotive',
  'painting',
  'tiling',
  'roofing',
  'hvac',
  'appliance_repair',
  'cleaning',
  'landscaping',
  'fashion',
  'beauty',
  'catering',
  'upholstery',
  'security',
  'ict_support'
);

-- 3. Ensure the 9 canonical parent categories are set to active
UPDATE categories
SET is_active = true
WHERE slug IN (
  'construction_building',
  'electrical_power',
  'plumbing_water',
  'auto_mechanical',
  'home_repairs',
  'beauty_fashion',
  'electronics_it',
  'hospitality_events',
  'arts_crafts'
);
