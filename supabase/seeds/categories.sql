INSERT INTO categories (name, slug, icon_name, sort_order) VALUES
  ('Plumbing',      'plumbing',      'plumbing',              1),
  ('Electrical',    'electrical',    'electrical_services',   2),
  ('Carpentry',     'carpentry',     'carpenter',             3),
  ('Cleaning',      'cleaning',      'cleaning_services',     4),
  ('Painting',      'painting',      'format_paint',          5),
  ('Construction',  'construction',  'construction',          6),
  ('HVAC',          'hvac',          'hvac',                  7),
  ('Landscaping',   'landscaping',   'grass',                 8)
ON CONFLICT (slug) DO NOTHING;
