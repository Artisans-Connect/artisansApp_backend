-- 20260626000000_reorganize_ghana_categories.sql
-- Migration to reorganize categories and trades in Ghana Artisans App

-- Avoid FK violations by setting jobs.category_id to NULL
UPDATE jobs SET category_id = NULL;

-- Clear existing data
DELETE FROM subcategories;
DELETE FROM categories;

-- 1. Insert Categories
INSERT INTO categories (name, slug, icon_name, color_hex, description, sort_order) VALUES
  ('Construction & Building', 'construction_building', 'barricade', '#B55D00', 'House building, masonry, carpentry, roofing, and metal works', 1),
  ('Electrical & Power', 'electrical_power', 'lightning', '#0058BE', 'Wiring, solar panels, appliance repair, and backup generators', 2),
  ('Plumbing & Water Systems', 'plumbing_water', 'drop', '#2196F3', 'Pipes, boreholes, water pump setup, and drainage repairs', 3),
  ('Auto & Mechanical Repairs', 'auto_mechanical', 'car', '#795548', 'Vehicle mechanic, spraying, auto body repair, and motorbikes', 4),
  ('Home Repairs & Maintenance', 'home_repairs', 'hammer', '#4CAF50', 'General handyman, furniture fixes, window lock repairs, and cleaning', 5),
  ('Beauty, Fashion & Personal Services', 'beauty_fashion', 'scissors', '#E91E63', 'Hairdressing, barbering, makeup, tailoring, and traditional accessories', 6),
  ('Electronics, Phones & IT Repairs', 'electronics_it', 'desktop_tower', '#1565C0', 'Phone screen replacement, laptops, TV, and printer setups', 7),
  ('Hospitality & Event Services', 'hospitality_events', 'fork_knife', '#C15A3D', 'Catering, events cake baking, decorators, and photo/video setups', 8),
  ('Arts, Craft & Traditional Work', 'arts_crafts', 'palette', '#9C27B0', 'Pottery, Kente weaving, woodcarving, drums, and custom jewellers', 9);

-- 2. Insert Subcategories (Trades & Common Tasks)
INSERT INTO subcategories (category_id, name, slug, description, sort_order)
SELECT c.id, s.name, s.slug, s.description, s.sort_order
FROM categories c
JOIN (VALUES
  -- Construction & Building
  ('construction_building', 'Mason', 'mason', 'Block laying, plastering, concrete work, foundation work', 1),
  ('construction_building', 'Carpenter', 'carpenter', 'Roofing woodwork, doors, cabinets, formwork, furniture repair', 2),
  ('construction_building', 'Tiler', 'tiler', 'Floor tiling, wall tiling, bathroom tiling, tile repair', 3),
  ('construction_building', 'Painter', 'painter', 'Interior painting, exterior painting, wall preparation', 4),
  ('construction_building', 'Steel Bender', 'steel_bender', 'Rebar bending, reinforcement fixing', 5),
  ('construction_building', 'Welder / Metal Fabricator', 'welder_fabricator', 'Gates, burglar proof, metal frames, railings', 6),
  ('construction_building', 'Ceiling Installer', 'ceiling_installer', 'POP ceiling, PVC ceiling, suspended ceiling', 7),
  ('construction_building', 'Glass Worker', 'glass_worker', 'Window glass, glass doors, glass replacement', 8),
  ('construction_building', 'Roofer', 'roofer', 'Roofing sheets, leak repairs, roof framing', 9),
  ('construction_building', 'Paver / Landscaper', 'paver_landscaper', 'Pavement blocks, compound finishing, kerbs', 10),

  -- Electrical & Power
  ('electrical_power', 'Electrician', 'electrician', 'Wiring, socket installation, light installation, fault tracing', 1),
  ('electrical_power', 'Solar Technician', 'solar_technician', 'Solar panel install, inverter setup, battery setup', 2),
  ('electrical_power', 'Appliance Electrician', 'appliance_electrician', 'Fan repair, iron repair, small appliance diagnosis', 3),
  ('electrical_power', 'Generator Technician', 'generator_technician', 'Generator repair, servicing, installation', 4),
  ('electrical_power', 'CCTV / Security Installer', 'cctv_security_installer', 'CCTV camera installation, intercom setup, access control', 5),

  -- Plumbing & Water Systems
  ('plumbing_water', 'Plumber', 'plumber', 'Pipe installation, pipe leakage repair, bathroom plumbing', 1),
  ('plumbing_water', 'Borehole / Pump Technician', 'borehole_pump_technician', 'Pump repair, water tank connection, pressure pump setup', 2),
  ('plumbing_water', 'Drainage Worker', 'drainage_worker', 'Drain cleaning, gutter repair, blocked pipe work', 3),
  ('plumbing_water', 'Sanitary Installer', 'sanitary_installer', 'WC installation, sink installation, shower installation', 4),

  -- Auto & Mechanical Repairs
  ('auto_mechanical', 'Auto Mechanic', 'auto_mechanic', 'Engine issues, servicing, brakes, suspension', 1),
  ('auto_mechanical', 'Auto Electrician', 'auto_electrician', 'Car wiring, battery issues, alternator, starter problems', 2),
  ('auto_mechanical', 'Vulcanizer', 'vulcanizer', 'Tyre repair, tyre replacement, wheel balancing', 3),
  ('auto_mechanical', 'Sprayer / Auto Body Worker', 'sprayer_body_worker', 'Car spraying, dents, body repair', 4),
  ('auto_mechanical', 'Motorcycle Mechanic', 'motorcycle_mechanic', 'Motorbike servicing, repairs', 5),
  ('auto_mechanical', 'Heavy Equipment Mechanic', 'heavy_equipment_mechanic', 'Excavator, truck, construction machinery repair', 6),

  -- Home Repairs & Maintenance
  ('home_repairs', 'General Handyman', 'general_handyman', 'Minor repairs, mounting, quick fixes', 1),
  ('home_repairs', 'Furniture Repairer', 'furniture_repairer', 'Chair repair, table repair, cabinet fixing', 2),
  ('home_repairs', 'Door/Window Repairer', 'door_window_repairer', 'Door locks, hinges, window frames', 3),
  ('home_repairs', 'Pest Control Worker', 'pest_control_worker', 'Ants, cockroaches, rodents, fumigation', 4),
  ('home_repairs', 'Cleaner', 'cleaner', 'Home cleaning, post-construction cleaning, office cleaning', 5),
  ('home_repairs', 'Gardener', 'gardener', 'Lawn care, hedge trimming, compound maintenance', 6),

  -- Beauty, Fashion & Personal Services
  ('beauty_fashion', 'Hairdresser', 'hairdresser', 'Braids, wig installation, washing, styling', 1),
  ('beauty_fashion', 'Barber', 'barber', 'Haircut, beard trim, home barber service', 2),
  ('beauty_fashion', 'Makeup Artist', 'makeup_artist', 'Event makeup, bridal makeup', 3),
  ('beauty_fashion', 'Tailor / Dressmaker', 'tailor_dressmaker', 'Dress sewing, alteration, school uniforms', 4),
  ('beauty_fashion', 'Shoemaker / Cobbler', 'shoemaker_cobbler', 'Shoe repair, custom sandals, sole replacement', 5),
  ('beauty_fashion', 'Bead Maker', 'bead_maker', 'Beads, bracelets, traditional accessories', 6),
  ('beauty_fashion', 'Milliner', 'milliner', 'Hats, fascinators, ceremonial headwear', 7),

  -- Electronics, Phones & IT Repairs
  ('electronics_it', 'Phone Repairer', 'phone_repairer', 'Screen replacement, charging port, battery', 1),
  ('electronics_it', 'Laptop Technician', 'laptop_technician', 'Hardware repair, OS install, keyboard/screen replacement', 2),
  ('electronics_it', 'TV Technician', 'tv_technician', 'TV repair, wall mounting', 3),
  ('electronics_it', 'Sound System Technician', 'sound_system_technician', 'Speaker repair, event sound setup', 4),
  ('electronics_it', 'Printer/Photocopier Technician', 'printer_photocopier_technician', 'Printer repair, toner issues, office equipment', 5),

  -- Hospitality & Event Services
  ('hospitality_events', 'Caterer', 'caterer', 'Food for events, small chops, local meals', 1),
  ('hospitality_events', 'Baker', 'baker', 'Cakes, pastries, bread', 2),
  ('hospitality_events', 'Decorator', 'decorator', 'Event decoration, balloons, traditional setups', 3),
  ('hospitality_events', 'Photographer', 'photographer', 'Event photography, portraits', 4),
  ('hospitality_events', 'Videographer', 'videographer', 'Event video, editing', 5),
  ('hospitality_events', 'DJ / Sound Provider', 'dj_sound_provider', 'Music setup, PA system', 6),
  ('hospitality_events', 'Canopy/Chair Rental', 'canopy_chair_rental', 'Chairs, tables, tents/canopies', 7),

  -- Arts, Craft & Traditional Work
  ('arts_crafts', 'Potter', 'potter', 'Clay pots, ceramics', 1),
  ('arts_crafts', 'Weaver', 'weaver', 'Kente, basket weaving, fabric weaving', 2),
  ('arts_crafts', 'Wood Carver', 'wood_carver', 'Carvings, stools, decor', 3),
  ('arts_crafts', 'Drum Maker', 'drum_maker', 'Traditional drums, repairs', 4),
  ('arts_crafts', 'Goldsmith / Jeweller', 'goldsmith_jeweller', 'Jewellery repair, custom jewellery', 5),
  ('arts_crafts', 'Brass Smith', 'brass_smith', 'Brass works, ornaments', 6),
  ('arts_crafts', 'Signwriter / Printer', 'signwriter_printer', 'Signboards, banners, stickers', 7)
) AS s(category_slug, name, slug, description, sort_order)
  ON c.slug = s.category_slug;
