INSERT INTO categories (name, slug, icon_name, color_hex, description, sort_order) VALUES
  ('Construction & Building', 'construction_building', 'barricade', '#B55D00', 'House building, masonry, carpentry, roofing, and metal works', 1),
  ('Electrical & Power', 'electrical_power', 'lightning', '#0058BE', 'Wiring, solar panels, appliance repair, and backup generators', 2),
  ('Plumbing & Water Systems', 'plumbing_water', 'drop', '#2196F3', 'Pipes, boreholes, water pump setup, and drainage repairs', 3),
  ('Auto & Mechanical Repairs', 'auto_mechanical', 'car', '#795548', 'Vehicle mechanic, spraying, auto body repair, and motorbikes', 4),
  ('Home Repairs & Maintenance', 'home_repairs', 'hammer', '#4CAF50', 'General handyman, furniture fixes, window lock repairs, and cleaning', 5),
  ('Beauty, Fashion & Personal Services', 'beauty_fashion', 'scissors', '#E91E63', 'Hairdressing, barbering, makeup, tailoring, and traditional accessories', 6),
  ('Electronics, Phones & IT Repairs', 'electronics_it', 'desktop_tower', '#1565C0', 'Phone screen replacement, laptops, TV, and printer setups', 7),
  ('Hospitality & Event Services', 'hospitality_events', 'fork_knife', '#C15A3D', 'Catering, events cake baking, decorators, and photo/video setups', 8),
  ('Arts, Craft & Traditional Work', 'arts_crafts', 'palette', '#9C27B0', 'Pottery, Kente weaving, woodcarving, drums, and custom jewellers', 9)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon_name = EXCLUDED.icon_name,
  color_hex = EXCLUDED.color_hex,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
