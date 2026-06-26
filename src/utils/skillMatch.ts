export const CATEGORY_ALIASES: Record<string, string[]> = {
  construction_building: ["construction", "building", "builder", "mason", "carpenter", "tiler", "painter", "welder", "steel bender", "ceiling", "glass", "roof", "paver", "masonry", "blockwork", "roofing", "woodwork", "metal", "fabricator"],
  electrical_power: ["electrical", "electrician", "wiring", "lighting", "socket", "outlet", "generator", "inverter", "solar", "battery", "cctv", "security", "intercom", "power", "appliance"],
  plumbing_water: ["plumbing", "plumber", "pipe", "pipes", "leak", "borehole", "pump", "drainage", "sanitary", "sink", "toilet", "shower", "water"],
  auto_mechanical: ["auto", "mechanic", "car", "vehicle", "vulcanizer", "sprayer", "motorcycle", "heavy equipment", "excavator", "truck", "tyre", "wheel", "engine"],
  home_repairs: ["home", "repairs", "handyman", "furniture", "door", "window", "pest", "cleaner", "gardener", "lock", "hinge", "fumigation", "cleaning", "maintenance"],
  beauty_fashion: ["beauty", "fashion", "hairdresser", "barber", "makeup", "tailor", "dressmaker", "shoemaker", "cobbler", "bead", "milliner", "hair", "wig", "uniform", "sandal", "jeweller"],
  electronics_it: ["electronics", "phones", "it", "phone", "laptop", "tv", "sound", "printer", "computer", "desktop", "screen", "keyboard", "copier"],
  hospitality_events: ["hospitality", "events", "caterer", "baker", "decorator", "photographer", "videographer", "dj", "canopy", "chair", "food", "cake", "balloon", "tent", "music"],
  arts_crafts: ["arts", "craft", "potter", "weaver", "wood carver", "drum", "goldsmith", "jeweller", "brass smith", "signwriter", "clay", "pot", "kente", "basket", "carving", "sticker", "signboard"],
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

