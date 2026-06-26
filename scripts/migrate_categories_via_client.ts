import { supabaseAdmin } from "../src/config/supabase";

async function run() {
  console.log("Starting reorganization...");

  // 1. Set jobs.category_id = NULL
  const { data: jobs, error: jobsErr } = await supabaseAdmin.from("jobs").select("id");
  if (jobsErr) {
    console.error("Error reading jobs:", jobsErr.message);
    process.exit(1);
  }
  if (jobs && jobs.length > 0) {
    console.log(`Setting category_id to NULL on ${jobs.length} jobs...`);
    const { error: updateJobsErr } = await supabaseAdmin
      .from("jobs")
      .update({ category_id: null })
      .in("id", jobs.map(j => j.id));
    if (updateJobsErr) {
      console.error("Error updating jobs:", updateJobsErr.message);
      process.exit(1);
    }
  }

  // 2. Clear subcategories and categories
  console.log("Clearing existing subcategories...");
  const { error: delSubErr } = await supabaseAdmin
    .from("subcategories")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all
  if (delSubErr) {
    console.error("Error deleting subcategories:", delSubErr.message);
    process.exit(1);
  }

  console.log("Clearing existing categories...");
  const { error: delCatErr } = await supabaseAdmin
    .from("categories")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all
  if (delCatErr) {
    console.error("Error deleting categories:", delCatErr.message);
    process.exit(1);
  }

  // 3. Insert categories
  const newCategories = [
    { name: 'Construction & Building', slug: 'construction_building', icon_name: 'barricade', color_hex: '#B55D00', description: 'House building, masonry, carpentry, roofing, and metal works', sort_order: 1 },
    { name: 'Electrical & Power', slug: 'electrical_power', icon_name: 'lightning', color_hex: '#0058BE', description: 'Wiring, solar panels, appliance repair, and backup generators', sort_order: 2 },
    { name: 'Plumbing & Water Systems', slug: 'plumbing_water', icon_name: 'drop', color_hex: '#2196F3', description: 'Pipes, boreholes, water pump setup, and drainage repairs', sort_order: 3 },
    { name: 'Auto & Mechanical Repairs', slug: 'auto_mechanical', icon_name: 'car', color_hex: '#795548', description: 'Vehicle mechanic, spraying, auto body repair, and motorbikes', sort_order: 4 },
    { name: 'Home Repairs & Maintenance', slug: 'home_repairs', icon_name: 'hammer', color_hex: '#4CAF50', description: 'General handyman, furniture fixes, window lock repairs, and cleaning', sort_order: 5 },
    { name: 'Beauty, Fashion & Personal Services', slug: 'beauty_fashion', icon_name: 'scissors', color_hex: '#E91E63', description: 'Hairdressing, barbering, makeup, tailoring, and traditional accessories', sort_order: 6 },
    { name: 'Electronics, Phones & IT Repairs', slug: 'electronics_it', icon_name: 'desktop_tower', color_hex: '#1565C0', description: 'Phone screen replacement, laptops, TV, and printer setups', sort_order: 7 },
    { name: 'Hospitality & Event Services', slug: 'hospitality_events', icon_name: 'fork_knife', color_hex: '#C15A3D', description: 'Catering, events cake baking, decorators, and photo/video setups', sort_order: 8 },
    { name: 'Arts, Craft & Traditional Work', slug: 'arts_crafts', icon_name: 'palette', color_hex: '#9C27B0', description: 'Pottery, Kente weaving, woodcarving, drums, and custom jewellers', sort_order: 9 }
  ];

  console.log("Inserting new categories...");
  const { data: insertedCategories, error: insCatErr } = await supabaseAdmin
    .from("categories")
    .insert(newCategories)
    .select();

  if (insCatErr) {
    console.error("Error inserting categories:", insCatErr.message);
    process.exit(1);
  }
  console.log(`Inserted ${insertedCategories?.length} categories.`);

  // Create a map of slug to ID
  const categorySlugToId: Record<string, string> = {};
  insertedCategories.forEach(cat => {
    categorySlugToId[cat.slug] = cat.id;
  });

  // 4. Insert subcategories
  const subcategoryValues = [
    // Construction & Building
    { category_slug: 'construction_building', name: 'Mason', slug: 'mason', description: 'Block laying, plastering, concrete work, foundation work', sort_order: 1 },
    { category_slug: 'construction_building', name: 'Carpenter', slug: 'carpenter', description: 'Roofing woodwork, doors, cabinets, formwork, furniture repair', sort_order: 2 },
    { category_slug: 'construction_building', name: 'Tiler', slug: 'tiler', description: 'Floor tiling, wall tiling, bathroom tiling, tile repair', sort_order: 3 },
    { category_slug: 'construction_building', name: 'Painter', slug: 'painter', description: 'Interior painting, exterior painting, wall preparation', sort_order: 4 },
    { category_slug: 'construction_building', name: 'Steel Bender', slug: 'steel_bender', description: 'Rebar bending, reinforcement fixing', sort_order: 5 },
    { category_slug: 'construction_building', name: 'Welder / Metal Fabricator', slug: 'welder_fabricator', description: 'Gates, burglar proof, metal frames, railings', sort_order: 6 },
    { category_slug: 'construction_building', name: 'Ceiling Installer', slug: 'ceiling_installer', description: 'POP ceiling, PVC ceiling, suspended ceiling', sort_order: 7 },
    { category_slug: 'construction_building', name: 'Glass Worker', slug: 'glass_worker', description: 'Window glass, glass doors, glass replacement', sort_order: 8 },
    { category_slug: 'construction_building', name: 'Roofer', slug: 'roofer', description: 'Roofing sheets, leak repairs, roof framing', sort_order: 9 },
    { category_slug: 'construction_building', name: 'Paver / Landscaper', slug: 'paver_landscaper', description: 'Pavement blocks, compound finishing, kerbs', sort_order: 10 },

    // Electrical & Power
    { category_slug: 'electrical_power', name: 'Electrician', slug: 'electrician', description: 'Wiring, socket installation, light installation, fault tracing', sort_order: 1 },
    { category_slug: 'electrical_power', name: 'Solar Technician', slug: 'solar_technician', description: 'Solar panel install, inverter setup, battery setup', sort_order: 2 },
    { category_slug: 'electrical_power', name: 'Appliance Electrician', slug: 'appliance_electrician', description: 'Fan repair, iron repair, small appliance diagnosis', sort_order: 3 },
    { category_slug: 'electrical_power', name: 'Generator Technician', slug: 'generator_technician', description: 'Generator repair, servicing, installation', sort_order: 4 },
    { category_slug: 'electrical_power', name: 'CCTV / Security Installer', slug: 'cctv_security_installer', description: 'CCTV camera installation, intercom setup, access control', sort_order: 5 },

    // Plumbing & Water Systems
    { category_slug: 'plumbing_water', name: 'Plumber', slug: 'plumber', description: 'Pipe installation, pipe leakage repair, bathroom plumbing', sort_order: 1 },
    { category_slug: 'plumbing_water', name: 'Borehole / Pump Technician', slug: 'borehole_pump_technician', description: 'Pump repair, water tank connection, pressure pump setup', sort_order: 2 },
    { category_slug: 'plumbing_water', name: 'Drainage Worker', slug: 'drainage_worker', description: 'Drain cleaning, gutter repair, blocked pipe work', sort_order: 3 },
    { category_slug: 'plumbing_water', name: 'Sanitary Installer', slug: 'sanitary_installer', description: 'WC installation, sink installation, shower installation', sort_order: 4 },

    // Auto & Mechanical Repairs
    { category_slug: 'auto_mechanical', name: 'Auto Mechanic', slug: 'auto_mechanic', description: 'Engine issues, servicing, brakes, suspension', sort_order: 1 },
    { category_slug: 'auto_mechanical', name: 'Auto Electrician', slug: 'auto_electrician', description: 'Car wiring, battery issues, alternator, starter problems', sort_order: 2 },
    { category_slug: 'auto_mechanical', name: 'Vulcanizer', slug: 'vulcanizer', description: 'Tyre repair, tyre replacement, wheel balancing', sort_order: 3 },
    { category_slug: 'auto_mechanical', name: 'Sprayer / Auto Body Worker', slug: 'sprayer_body_worker', description: 'Car spraying, dents, body repair', sort_order: 4 },
    { category_slug: 'auto_mechanical', name: 'Motorcycle Mechanic', slug: 'motorcycle_mechanic', description: 'Motorbike servicing, repairs', sort_order: 5 },
    { category_slug: 'auto_mechanical', name: 'Heavy Equipment Mechanic', slug: 'heavy_equipment_mechanic', description: 'Excavator, truck, construction machinery repair', sort_order: 6 },

    // Home Repairs & Maintenance
    { category_slug: 'home_repairs', name: 'General Handyman', slug: 'general_handyman', description: 'Minor repairs, mounting, quick fixes', sort_order: 1 },
    { category_slug: 'home_repairs', name: 'Furniture Repairer', slug: 'furniture_repairer', description: 'Chair repair, table repair, cabinet fixing', sort_order: 2 },
    { category_slug: 'home_repairs', name: 'Door/Window Repairer', slug: 'door_window_repairer', description: 'Door locks, hinges, window frames', sort_order: 3 },
    { category_slug: 'home_repairs', name: 'Pest Control Worker', slug: 'pest_control_worker', description: 'Ants, cockroaches, rodents, fumigation', sort_order: 4 },
    { category_slug: 'home_repairs', name: 'Cleaner', slug: 'cleaner', description: 'Home cleaning, post-construction cleaning, office cleaning', sort_order: 5 },
    { category_slug: 'home_repairs', name: 'Gardener', slug: 'gardener', description: 'Lawn care, hedge trimming, compound maintenance', sort_order: 6 },

    // Beauty, Fashion & Personal Services
    { category_slug: 'beauty_fashion', name: 'Hairdresser', slug: 'hairdresser', description: 'Braids, wig installation, washing, styling', sort_order: 1 },
    { category_slug: 'beauty_fashion', name: 'Barber', slug: 'barber', description: 'Haircut, beard trim, home barber service', sort_order: 2 },
    { category_slug: 'beauty_fashion', name: 'Makeup Artist', slug: 'makeup_artist', description: 'Event makeup, bridal makeup', sort_order: 3 },
    { category_slug: 'beauty_fashion', name: 'Tailor / Dressmaker', slug: 'tailor_dressmaker', description: 'Dress sewing, alteration, school uniforms', sort_order: 4 },
    { category_slug: 'beauty_fashion', name: 'Shoemaker / Cobbler', slug: 'shoemaker_cobbler', description: 'Shoe repair, custom sandals, sole replacement', sort_order: 5 },
    { category_slug: 'beauty_fashion', name: 'Bead Maker', slug: 'bead_maker', description: 'Beads, bracelets, traditional accessories', sort_order: 6 },
    { category_slug: 'beauty_fashion', name: 'Milliner', slug: 'milliner', description: 'Hats, fascinators, ceremonial headwear', sort_order: 7 },

    // Electronics, Phones & IT Repairs
    { category_slug: 'electronics_it', name: 'Phone Repairer', slug: 'phone_repairer', description: 'Screen replacement, charging port, battery', sort_order: 1 },
    { category_slug: 'electronics_it', name: 'Laptop Technician', slug: 'laptop_technician', description: 'Hardware repair, OS install, keyboard/screen replacement', sort_order: 2 },
    { category_slug: 'electronics_it', name: 'TV Technician', slug: 'tv_technician', description: 'TV repair, wall mounting', sort_order: 3 },
    { category_slug: 'electronics_it', name: 'Sound System Technician', slug: 'sound_system_technician', description: 'Speaker repair, event sound setup', sort_order: 4 },
    { category_slug: 'electronics_it', name: 'Printer/Photocopier Technician', slug: 'printer_photocopier_technician', description: 'Printer repair, toner issues, office equipment', sort_order: 5 },

    // Hospitality & Event Services
    { category_slug: 'hospitality_events', name: 'Caterer', slug: 'caterer', description: 'Food for events, small chops, local meals', sort_order: 1 },
    { category_slug: 'hospitality_events', name: 'Baker', slug: 'baker', description: 'Cakes, pastries, bread', sort_order: 2 },
    { category_slug: 'hospitality_events', name: 'Decorator', slug: 'decorator', description: 'Event decoration, balloons, traditional setups', sort_order: 3 },
    { category_slug: 'hospitality_events', name: 'Photographer', slug: 'photographer', description: 'Event photography, portraits', sort_order: 4 },
    { category_slug: 'hospitality_events', name: 'Videographer', slug: 'videographer', description: 'Event video, editing', sort_order: 5 },
    { category_slug: 'hospitality_events', name: 'DJ / Sound Provider', slug: 'dj_sound_provider', description: 'Music setup, PA system', sort_order: 6 },
    { category_slug: 'hospitality_events', name: 'Canopy/Chair Rental', slug: 'canopy_chair_rental', description: 'Chairs, tables, tents/canopies', sort_order: 7 },

    // Arts, Craft & Traditional Work
    { category_slug: 'arts_crafts', name: 'Potter', slug: 'potter', description: 'Clay pots, ceramics', sort_order: 1 },
    { category_slug: 'arts_crafts', name: 'Weaver', slug: 'weaver', description: 'Kente, basket weaving, fabric weaving', sort_order: 2 },
    { category_slug: 'arts_crafts', name: 'Wood Carver', slug: 'wood_carver', description: 'Carvings, stools, decor', sort_order: 3 },
    { category_slug: 'arts_crafts', name: 'Drum Maker', slug: 'drum_maker', description: 'Traditional drums, repairs', sort_order: 4 },
    { category_slug: 'arts_crafts', name: 'Goldsmith / Jeweller', slug: 'goldsmith_jeweller', description: 'Jewellery repair, custom jewellery', sort_order: 5 },
    { category_slug: 'arts_crafts', name: 'Brass Smith', slug: 'brass_smith', description: 'Brass works, ornaments', sort_order: 6 },
    { category_slug: 'arts_crafts', name: 'Signwriter / Printer', slug: 'signwriter_printer', description: 'Signboards, banners, stickers', sort_order: 7 }
  ];

  const subcategoriesToInsert = subcategoryValues.map(val => {
    const category_id = categorySlugToId[val.category_slug];
    if (!category_id) {
      throw new Error(`Category not found for slug: ${val.category_slug}`);
    }
    return {
      category_id,
      name: val.name,
      slug: val.slug,
      description: val.description,
      sort_order: val.sort_order
    };
  });

  console.log("Inserting new subcategories...");
  const { data: insertedSubcategories, error: insSubErr } = await supabaseAdmin
    .from("subcategories")
    .insert(subcategoriesToInsert)
    .select();

  if (insSubErr) {
    console.error("Error inserting subcategories:", insSubErr.message);
    process.exit(1);
  }
  console.log(`Successfully migrated database categories and trades. Inserted ${insertedSubcategories?.length} subcategories.`);
  console.log("Migration complete!");
}

run();
