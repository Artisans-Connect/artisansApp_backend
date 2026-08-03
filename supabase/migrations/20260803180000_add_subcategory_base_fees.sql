-- 20260803180000_add_subcategory_base_fees.sql
-- Add base_fee column to subcategories table to support trade-specific base fee overrides with category fallback.

ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS base_fee integer NULL CHECK (base_fee >= 0);

-- Seed baseline fee overrides for specialized high-value trade subcategories
UPDATE subcategories SET base_fee = 150 WHERE slug = 'solar_technician';
UPDATE subcategories SET base_fee = 120 WHERE slug = 'generator_technician';
UPDATE subcategories SET base_fee = 200 WHERE slug = 'heavy_equipment_mechanic';
UPDATE subcategories SET base_fee = 120 WHERE slug = 'borehole_pump_technician';
UPDATE subcategories SET base_fee = 100 WHERE slug = 'cctv_security_installer';
