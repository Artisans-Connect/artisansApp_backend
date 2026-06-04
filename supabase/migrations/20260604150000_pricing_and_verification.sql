-- Smart pricing: add base_fee to categories for per-category minimum service fees
ALTER TABLE categories ADD COLUMN base_fee numeric(10,2) NOT NULL DEFAULT 80.00;

-- Set category-specific base fees (GH₵)
UPDATE categories SET base_fee = 100.00 WHERE slug = 'electrical';
UPDATE categories SET base_fee = 80.00  WHERE slug = 'plumbing';
UPDATE categories SET base_fee = 70.00  WHERE slug = 'carpentry';
UPDATE categories SET base_fee = 60.00  WHERE slug = 'cleaning';
UPDATE categories SET base_fee = 65.00  WHERE slug = 'painting';
UPDATE categories SET base_fee = 120.00 WHERE slug = 'construction';
UPDATE categories SET base_fee = 90.00  WHERE slug = 'hvac';
UPDATE categories SET base_fee = 55.00  WHERE slug = 'landscaping';

-- Verification flag for clients (verified clients get premium matching)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
