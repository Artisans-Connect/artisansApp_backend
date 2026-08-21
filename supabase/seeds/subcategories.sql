INSERT INTO subcategories (category_id, name, slug, description, sort_order, is_active)
SELECT c.id, s.name, s.slug, s.description, s.sort_order, s.is_active
FROM categories c
JOIN (VALUES
  -- Carpentry & Woodwork (construction_building) - Carpenter active for beachhead
  ('construction_building', 'Carpenter', 'carpenter', 'Roofing woodwork, doors, cabinets, formwork, furniture repair', 1, true),
  ('construction_building', 'Mason', 'mason', 'Block laying, plastering, concrete work, foundation work', 2, false),
  ('construction_building', 'Tiler', 'tiler', 'Floor tiling, wall tiling, bathroom tiling, tile repair', 3, false),
  ('construction_building', 'Painter', 'painter', 'Interior painting, exterior painting, wall preparation', 4, false),
  ('construction_building', 'Steel Bender', 'steel_bender', 'Rebar bending, reinforcement fixing', 5, false),
  ('construction_building', 'Welder / Metal Fabricator', 'welder_fabricator', 'Gates, burglar proof, metal frames, railings', 6, false),
  ('construction_building', 'Ceiling Installer', 'ceiling_installer', 'POP ceiling, PVC ceiling, suspended ceiling', 7, false),
  ('construction_building', 'Glass Worker', 'glass_worker', 'Window glass, glass doors, glass replacement', 8, false),
  ('construction_building', 'Roofer', 'roofer', 'Roofing sheets, leak repairs, roof framing', 9, false),
  ('construction_building', 'Paver / Landscaper', 'paver_landscaper', 'Pavement blocks, compound finishing, kerbs', 10, false),

  -- Electrical & Power
  ('electrical_power', 'Electrician', 'electrician', 'Wiring, socket installation, light installation, fault tracing', 1, true),
  ('electrical_power', 'Solar Technician', 'solar_technician', 'Solar panel install, inverter setup, battery setup', 2, true),
  ('electrical_power', 'Appliance Electrician', 'appliance_electrician', 'Fan repair, iron repair, small appliance diagnosis', 3, true),
  ('electrical_power', 'Generator Technician', 'generator_technician', 'Generator repair, servicing, installation', 4, true),
  ('electrical_power', 'CCTV / Security Installer', 'cctv_security_installer', 'CCTV camera installation, intercom setup, access control', 5, true),

  -- Plumbing & Water Systems
  ('plumbing_water', 'Plumber', 'plumber', 'Pipe installation, pipe leakage repair, bathroom plumbing', 1, true),
  ('plumbing_water', 'Borehole / Pump Technician', 'borehole_pump_technician', 'Pump repair, water tank connection, pressure pump setup', 2, true),
  ('plumbing_water', 'Drainage Worker', 'drainage_worker', 'Drain cleaning, gutter repair, blocked pipe work', 3, true),
  ('plumbing_water', 'Sanitary Installer', 'sanitary_installer', 'WC installation, sink installation, shower installation', 4, true),

  -- Auto & Mechanical Repairs
  ('auto_mechanical', 'Auto Mechanic', 'auto_mechanic', 'Engine issues, servicing, brakes, suspension', 1, true),
  ('auto_mechanical', 'Auto Electrician', 'auto_electrician', 'Car wiring, battery issues, alternator, starter problems', 2, true),
  ('auto_mechanical', 'Vulcanizer', 'vulcanizer', 'Tyre repair, tyre replacement, wheel balancing', 3, true),
  ('auto_mechanical', 'Sprayer / Auto Body Worker', 'sprayer_body_worker', 'Car spraying, dents, body repair', 4, true),
  ('auto_mechanical', 'Motorcycle Mechanic', 'motorcycle_mechanic', 'Motorbike servicing, repairs', 5, true),
  ('auto_mechanical', 'Heavy Equipment Mechanic', 'heavy_equipment_mechanic', 'Excavator, truck, construction machinery repair', 6, true),

  -- Home Repairs & Maintenance (Deactivated)
  ('home_repairs', 'General Handyman', 'general_handyman', 'Minor repairs, mounting, quick fixes', 1, false),
  ('home_repairs', 'Furniture Repairer', 'furniture_repairer', 'Chair repair, table repair, cabinet fixing', 2, false),
  ('home_repairs', 'Door/Window Repairer', 'door_window_repairer', 'Door locks, hinges, window frames', 3, false),
  ('home_repairs', 'Pest Control Worker', 'pest_control_worker', 'Ants, cockroaches, rodents, fumigation', 4, false),
  ('home_repairs', 'Cleaner', 'cleaner', 'Home cleaning, post-construction cleaning, office cleaning', 5, false),
  ('home_repairs', 'Gardener', 'gardener', 'Lawn care, hedge trimming, compound maintenance', 6, false),

  -- Beauty, Fashion & Personal Services (Deactivated)
  ('beauty_fashion', 'Hairdresser', 'hairdresser', 'Braids, wig installation, washing, styling', 1, false),
  ('beauty_fashion', 'Barber', 'barber', 'Haircut, beard trim, home barber service', 2, false),
  ('beauty_fashion', 'Makeup Artist', 'makeup_artist', 'Event makeup, bridal makeup', 3, false),
  ('beauty_fashion', 'Tailor / Dressmaker', 'tailor_dressmaker', 'Dress sewing, alteration, school uniforms', 4, false),
  ('beauty_fashion', 'Shoemaker / Cobbler', 'shoemaker_cobbler', 'Shoe repair, custom sandals, sole replacement', 5, false),
  ('beauty_fashion', 'Bead Maker', 'bead_maker', 'Beads, bracelets, traditional accessories', 6, false),
  ('beauty_fashion', 'Milliner', 'milliner', 'Hats, fascinators, ceremonial headwear', 7, false),

  -- Electronics, Phones & IT Repairs (Deactivated)
  ('electronics_it', 'Phone Repairer', 'phone_repairer', 'Screen replacement, charging port, battery', 1, false),
  ('electronics_it', 'Laptop Technician', 'laptop_technician', 'Hardware repair, OS install, keyboard/screen replacement', 2, false),
  ('electronics_it', 'TV Technician', 'tv_technician', 'TV repair, wall mounting', 3, false),
  ('electronics_it', 'Sound System Technician', 'sound_system_technician', 'Speaker repair, event sound setup', 4, false),
  ('electronics_it', 'Printer/Photocopier Technician', 'printer_photocopier_technician', 'Printer repair, toner issues, office equipment', 5, false),

  -- Hospitality & Event Services (Deactivated)
  ('hospitality_events', 'Caterer', 'caterer', 'Food for events, small chops, local meals', 1, false),
  ('hospitality_events', 'Baker', 'baker', 'Cakes, pastries, bread', 2, false),
  ('hospitality_events', 'Decorator', 'decorator', 'Event decoration, balloons, traditional setups', 3, false),
  ('hospitality_events', 'Photographer', 'photographer', 'Event photography, portraits', 4, false),
  ('hospitality_events', 'Videographer', 'videographer', 'Event video, editing', 5, false),
  ('hospitality_events', 'DJ / Sound Provider', 'dj_sound_provider', 'Music setup, PA system', 6, false),
  ('hospitality_events', 'Canopy/Chair Rental', 'canopy_chair_rental', 'Chairs, tables, tents/canopies', 7, false),

  -- Arts, Craft & Traditional Work (Deactivated)
  ('arts_crafts', 'Potter', 'potter', 'Clay pots, ceramics', 1, false),
  ('arts_crafts', 'Weaver', 'weaver', 'Kente, basket weaving, fabric weaving', 2, false),
  ('arts_crafts', 'Wood Carver', 'wood_carver', 'Carvings, stools, decor', 3, false),
  ('arts_crafts', 'Drum Maker', 'drum_maker', 'Traditional drums, repairs', 4, false),
  ('arts_crafts', 'Goldsmith / Jeweller', 'goldsmith_jeweller', 'Jewellery repair, custom jewellery', 5, false),
  ('arts_crafts', 'Brass Smith', 'brass_smith', 'Brass works, ornaments', 6, false),
  ('arts_crafts', 'Signwriter / Printer', 'signwriter_printer', 'Signboards, banners, stickers', 7, false)
) AS s(category_slug, name, slug, description, sort_order, is_active)
  ON c.slug = s.category_slug
ON CONFLICT (category_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
