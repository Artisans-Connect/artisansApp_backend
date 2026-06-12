-- Add new columns to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS color_hex text,
ADD COLUMN IF NOT EXISTS description text;

-- Create subcategories table
CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(category_id, slug)
);

-- Enable RLS on subcategories
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can view active subcategories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subcategories'
      AND policyname = 'Anyone can view active subcategories'
  ) THEN
    CREATE POLICY "Anyone can view active subcategories" ON subcategories
    FOR SELECT
    USING (is_active = true);
  END IF;
END $$;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON subcategories(is_active);
