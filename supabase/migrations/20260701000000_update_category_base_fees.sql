-- Update base fees for the reorganized categories based on the July 2026 Ghana Pricing Audit (Budget-Friendly Calibration)

UPDATE categories
SET base_fee = CASE slug
  WHEN 'construction_building' THEN 70.00
  WHEN 'electrical_power' THEN 80.00
  WHEN 'plumbing_water' THEN 60.00
  WHEN 'auto_mechanical' THEN 40.00
  WHEN 'home_repairs' THEN 50.00
  WHEN 'beauty_fashion' THEN 40.00
  WHEN 'electronics_it' THEN 50.00
  WHEN 'hospitality_events' THEN 150.00
  WHEN 'arts_crafts' THEN 50.00
  ELSE base_fee
END
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
