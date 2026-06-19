-- Set intentional Smart Pricing base fees for the expanded Ghana service catalog.
-- Keeps pricing deterministic for newly added categories instead of relying on the GHc80 fallback.

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS base_fee numeric(10,2) NOT NULL DEFAULT 80.00;

UPDATE categories
SET base_fee = CASE slug
  WHEN 'plumbing' THEN 80.00
  WHEN 'electrical' THEN 100.00
  WHEN 'carpentry' THEN 70.00
  WHEN 'masonry' THEN 90.00
  WHEN 'welding' THEN 95.00
  WHEN 'construction' THEN 120.00
  WHEN 'automotive' THEN 100.00
  WHEN 'painting' THEN 65.00
  WHEN 'tiling' THEN 85.00
  WHEN 'roofing' THEN 110.00
  WHEN 'hvac' THEN 90.00
  WHEN 'appliance_repair' THEN 85.00
  WHEN 'cleaning' THEN 60.00
  WHEN 'landscaping' THEN 55.00
  WHEN 'fashion' THEN 50.00
  WHEN 'beauty' THEN 50.00
  WHEN 'catering' THEN 100.00
  WHEN 'upholstery' THEN 75.00
  WHEN 'security' THEN 90.00
  WHEN 'ict_support' THEN 80.00
  ELSE base_fee
END
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
