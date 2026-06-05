const CATEGORY_ALIASES: Record<string, string[]> = {
  plumbing: ["plumbing", "plumber", "pipe", "pipes"],
  electrical: ["electrical", "electrician", "wiring", "lighting"],
  carpentry: ["carpentry", "carpenter", "woodwork", "furniture"],
  cleaning: ["cleaning", "cleaner", "deep clean"],
  painting: ["painting", "painter", "paint"],
  construction: ["construction", "mason", "masonry", "builder"],
  hvac: ["hvac", "ac", "air conditioning", "heating"],
  landscaping: ["landscaping", "landscape", "lawn", "garden"],
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
