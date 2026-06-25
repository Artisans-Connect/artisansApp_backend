export const CATEGORY_ALIASES: Record<string, string[]> = {
  plumbing: ["plumbing", "plumber", "pipe", "pipes", "drainage", "septic", "sink", "toilet", "pump"],
  electrical: ["electrical", "electrician", "wiring", "lighting", "socket", "outlet", "generator", "inverter"],
  carpentry: ["carpentry", "carpenter", "woodwork", "furniture", "cabinet", "wardrobe", "door", "joinery"],
  masonry: ["masonry", "mason", "block", "blockwork", "block laying", "plaster", "plastering", "concrete", "bricklayer", "brick laying"],
  welding: ["welding", "welder", "fabrication", "fabricator", "metal", "metalwork", "blacksmith", "burglar proof", "gate"],
  construction: ["construction", "builder", "building", "renovation", "site labour", "structural", "finishing"],
  automotive: ["automotive", "mechanic", "auto", "car", "vehicle", "motorbike", "motorcycle", "tricycle", "engine", "sprayer", "auto body"],
  painting: ["painting", "painter", "paint", "decorative finish", "texture coating"],
  tiling: ["tiling", "tiler", "tile", "tiles", "flooring", "floor", "terrazzo", "screed"],
  roofing: ["roofing", "roofer", "roof", "ceiling", "pop ceiling", "pvc ceiling"],
  hvac: ["hvac", "ac", "air conditioning", "air conditioner", "refrigeration", "fridge", "freezer", "cold room", "ventilation"],
  appliance_repair: ["appliance", "appliance repair", "electronics", "electronic", "repairer", "tv", "fridge", "washing machine", "cooker"],
  cleaning: ["cleaning", "cleaner", "deep clean", "fumigation", "pest control", "move in", "move out"],
  landscaping: ["landscaping", "landscape", "lawn", "garden", "weeding", "compound cleanup"],
  fashion: ["fashion", "dressmaking", "dressmaker", "tailor", "tailoring", "seamstress", "sewing", "alterations", "uniform", "shoe", "shoes", "shoemaker", "cobbler", "leatherwork", "footwear"],
  beauty: ["beauty", "hair", "hairdresser", "hairdressing", "barber", "barbering", "makeup", "nails"],
  catering: ["catering", "caterer", "cook", "cooking", "baking", "baker", "event food", "pastry", "butcher", "butchering", "slaughter", "slaughtering", "meat"],
  upholstery: ["upholstery", "upholsterer", "sofa", "cushion", "curtain", "curtains", "blinds"],
  security: ["security", "locksmith", "lock", "locks", "keys", "cctv", "access control", "burglar proof"],
  ict_support: ["ict", "it", "computer", "phone repair", "laptop", "desktop", "network", "wifi", "router", "device support"],
};

export function workerHasCategorySkill(skills: string[] | null | undefined, categoryKey: string): boolean {
  const key = categoryKey.trim().toLowerCase();
  if (!key) return true;

  const aliases = CATEGORY_ALIASES[key] ?? [key];
  const normalizedSkills = (skills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean);
  if (normalizedSkills.length === 0) return false;

  return normalizedSkills.some((skill) =>
    aliases.some((alias) => skill.includes(alias) || alias.includes(skill)),
  );
}

export function findMatchingCategories(query: string): { slug: string; score: number }[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const stopwords = new Set([
    "i", "need", "someone", "to", "my", "fix", "repair", "install", "help", "with", "a", "an", "the", "for", "please", "urgent", "urgently", "find", "me", "want", "looking"
  ]);
  const tokens = normalizedQuery
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 0 && !stopwords.has(t));

  const results: { slug: string; score: number }[] = [];

  for (const [slug, aliases] of Object.entries(CATEGORY_ALIASES)) {
    let score = 0;
    for (const token of tokens) {
      for (const alias of aliases) {
        if (alias === token) {
          score += 1.0;
        } else if (alias.includes(token)) {
          score += 0.5;
        } else if (token.includes(alias)) {
          score += 0.5;
        }
      }
    }
    if (score > 0) {
      results.push({ slug, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

