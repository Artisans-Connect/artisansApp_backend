INSERT INTO categories (name, slug, icon_name, color_hex, description, sort_order) VALUES
  ('Plumbing',      'plumbing',      'drop',                '#4648D4', 'Repairs, installation, maintenance',                1),
  ('Electrical',    'electrical',    'lightning',           '#0058BE', 'Wiring, repairs, installations',                    2),
  ('Carpentry',     'carpentry',     'wrench',              '#B55D00', 'Furniture, repairs, custom work',                   3),
  ('Cleaning',      'cleaning',      'broom',               '#00E676', 'Home, office, deep cleaning',                        4),
  ('Painting',      'painting',      'palette',             '#F44336', 'Interior, exterior, decorative',                    5),
  ('Construction',  'construction',  'barricade',           '#FF9800', 'Building, renovation, repairs',                     6),
  ('HVAC',          'hvac',          'snowflake',           '#2196F3', 'Cooling, heating, ventilation',                     7),
  ('Landscaping',   'landscaping',   'mountains',           '#4CAF50', 'Lawn, garden, outdoor design',                      8)
ON CONFLICT (slug) DO NOTHING;
