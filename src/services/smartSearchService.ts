import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { findMatchingCategories, type CategoryMatchCatalogItem } from "../utils/skillMatch";

const GEMINI_MODEL = "gemini-3.5-flash";

export interface ParsedIntent {
  categories: string[];
  refinedQuery: string;
  intentSummary: string;
}

export type SearchIntentCatalogItem = CategoryMatchCatalogItem;

export interface ResolvedTradeIntent {
  matched: boolean;
  resolvedTrade: string;
}

const TRADE_INTENT_ALIASES: Record<string, string[]> = {
  "appliance electrician": ["fan repair", "iron repair", "appliance repair", "small appliance", "electrical appliance"],
  "auto electrician": ["car wiring", "battery issue", "alternator", "starter problem", "vehicle electrical"],
  "auto mechanic": ["car repair", "vehicle repair", "engine", "brakes", "suspension", "servicing"],
  baker: ["cake", "pastry", "bread", "baking"],
  barber: ["haircut", "beard trim", "barbing"],
  "bead maker": ["beads", "bracelet", "traditional accessories"],
  "borehole pump technician": ["borehole", "water pump", "pressure pump", "water tank", "pump repair"],
  "brass smith": ["brass work", "brass ornament"],
  "canopy chair rental": ["canopy", "chair rental", "table rental", "tent rental"],
  carpenter: ["cabinet", "cabinetry", "woodwork", "furniture making", "roofing woodwork", "door making"],
  caterer: ["catering", "food for events", "small chops", "local meals"],
  "cctv security installer": ["cctv", "security camera", "intercom", "access control"],
  "ceiling installer": ["pop ceiling", "pvc ceiling", "suspended ceiling"],
  cleaner: ["cleaning", "home cleaning", "office cleaning", "post construction cleaning"],
  decorator: ["event decor", "decoration", "balloons", "traditional setup"],
  "dj sound provider": ["dj", "music setup", "pa system", "sound provider"],
  "door window repairer": ["door lock", "window frame", "hinge", "door repair", "window repair"],
  "drainage worker": ["drain", "gutter", "blocked pipe", "drain cleaning"],
  "drum maker": ["traditional drum", "drum repair"],
  electrician: ["wiring", "electrical", "socket", "outlet", "lighting"],
  "furniture repairer": ["chair repair", "table repair", "cabinet fixing", "furniture fixing"],
  gardener: ["lawn", "hedge", "compound maintenance", "gardening"],
  "general handyman": ["minor repairs", "mounting", "quick fixes", "handyman"],
  "generator technician": ["generator", "genset", "gen set", "generator repair", "generator servicing"],
  "glass worker": ["window glass", "glass door", "glass replacement"],
  "goldsmith jeweller": ["goldsmith", "jeweller", "jewelry", "jewellery", "custom jewellery"],
  "heavy equipment mechanic": ["excavator", "truck", "construction machinery", "heavy equipment"],
  hairdresser: ["braids", "wig", "hair styling", "hair washing"],
  "laptop technician": ["laptop", "computer repair", "keyboard replacement", "screen replacement", "os install"],
  "makeup artist": ["makeup", "bridal makeup", "event makeup"],
  mason: ["block laying", "plastering", "concrete", "foundation", "masonry"],
  milliner: ["hat", "fascinator", "ceremonial headwear"],
  "motorcycle mechanic": ["motorbike", "motorcycle", "bike servicing"],
  painter: ["painting", "paint walls"],
  "paver landscaper": ["pavement", "paving", "compound finishing", "kerb", "landscaping"],
  "phone repairer": ["phone repair", "mobile phone", "cracked screen"],
  photographer: ["photo", "event photography", "portrait"],
  plumber: ["plumbing", "pipe leak", "leaking tap", "sink", "toilet"],
  potter: ["clay pot", "ceramics", "pottery"],
  "printer photocopier technician": ["printer", "photocopier", "toner", "office equipment"],
  roofer: ["roof", "roofing sheet", "roof leak", "roof framing"],
  "sanitary installer": ["wc installation", "sink installation", "shower installation", "bathroom fitting"],
  "shoemaker cobbler": ["shoe repair", "custom sandals", "sole replacement"],
  "signwriter printer": ["signboard", "banner", "sticker", "signwriter"],
  "solar technician": ["solar", "solar panel", "inverter", "battery setup"],
  "sound system technician": ["speaker repair", "event sound", "sound system"],
  "sprayer auto body worker": ["car spraying", "dent", "body repair", "auto body"],
  "steel bender": ["rebar", "reinforcement", "steel bending"],
  "tailor dressmaker": ["tailor", "dress sewing", "alteration", "school uniform", "sewing"],
  tiler: ["tile", "tiling", "floor tiling", "wall tiling", "bathroom tiling"],
  "tv technician": ["tv", "television", "wall mounting"],
  videographer: ["video", "event video", "editing"],
  vulcanizer: ["tyre", "tire", "wheel balancing", "tyre repair"],
  weaver: ["kente", "basket weaving", "fabric weaving"],
  "welder metal fabricator": ["welder", "welding", "metal fabrication", "gate", "burglar proof", "railings"],
  "wood carver": ["wood carving", "carving", "stool", "wood decor"],
};

function normalizeTradeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchTradeNameLocally(
  query: string,
  tradeNames: readonly string[],
): string | null {
  const normalizedQuery = normalizeTradeText(query);
  if (!normalizedQuery) return null;

  for (const tradeName of tradeNames) {
    const normalizedTrade = normalizeTradeText(tradeName);
    if (normalizedTrade && normalizedQuery.includes(normalizedTrade)) {
      return tradeName;
    }
  }

  for (const tradeName of tradeNames) {
    const aliases = TRADE_INTENT_ALIASES[normalizeTradeText(tradeName)] ?? [];
    if (aliases.some((alias) => normalizedQuery.includes(alias))) {
      return tradeName;
    }
  }

  return null;
}

export async function resolveTradeIntent(
  query: string,
  tradeNames: readonly string[],
): Promise<ResolvedTradeIntent> {
  const localMatch = matchTradeNameLocally(query, tradeNames);
  if (localMatch) return { matched: true, resolvedTrade: localMatch };

  if (env.GEMINI_API_KEY && query.trim() && tradeNames.length > 0) {
    try {
      const aiMatch = await resolveTradeWithGemini(query, tradeNames);
      if (aiMatch) return { matched: true, resolvedTrade: aiMatch };
    } catch (error) {
      console.error("Gemini trade resolution failed:", error);
    }
  }

  return { matched: false, resolvedTrade: query.trim() };
}

async function resolveTradeWithGemini(
  query: string,
  tradeNames: readonly string[],
): Promise<string | null> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });
  const prompt = `Match the user's described work to exactly one trade from the supplied active catalog. Return {"trade": null} when none fits. Never return a value outside the catalog.\nCatalog: ${JSON.stringify(tradeNames)}\nUser description: ${JSON.stringify(query)}`;
  const result = await model.generateContent(prompt);
  const parsed: unknown = JSON.parse(result.response.text());
  const proposedTrade =
    typeof parsed === "object" && parsed !== null && "trade" in parsed
      ? (parsed as { trade?: unknown }).trade
      : null;
  if (typeof proposedTrade !== "string") return null;

  const normalizedProposal = normalizeTradeText(proposedTrade);
  return (
    tradeNames.find(
      (tradeName) => normalizeTradeText(tradeName) === normalizedProposal,
    ) ?? null
  );
}

// In-memory cache for search intent (10 minutes TTL)
interface CacheEntry {
  intent: ParsedIntent;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function parseSearchIntent(
  query: string,
  catalog: readonly SearchIntentCatalogItem[] = [],
): Promise<ParsedIntent> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { categories: [], refinedQuery: "", intentSummary: "" };
  }

  const catalogKey = catalog.map((category) => category.slug).sort().join(",");
  const cacheKey = `${catalogKey}:${normalizedQuery}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.intent;
  }

  let result: ParsedIntent;

  if (env.GEMINI_API_KEY) {
    try {
      result = await parseWithGemini(query, catalog);
    } catch (error) {
      console.error("Gemini parse failed, falling back to local matching:", error);
      result = parseWithLocalFallback(query, catalog);
    }
  } else {
    result = parseWithLocalFallback(query, catalog);
  }

  result = normalizeIntentAgainstCatalog(result, query, catalog);

  // Cache result
  cache.set(cacheKey, {
    intent: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

async function parseWithGemini(
  query: string,
  catalog: readonly SearchIntentCatalogItem[],
): Promise<ParsedIntent> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const catalogPrompt = catalog.length > 0
    ? catalog.map((category) => {
        const subcategories = (category.subcategories ?? [])
          .map((subcategory) => subcategory.name ?? subcategory.slug)
          .filter(Boolean)
          .join(", ");
        return `- ${category.name ?? category.slug} (slug: ${category.slug})${subcategories ? `: ${subcategories}` : ""}`;
      }).join("\n")
    : `- Construction & Building (slug: construction_building): Mason, Carpenter, Tiler, Painter, Steel Bender, Welder / Metal Fabricator, Ceiling Installer, Glass Worker, Roofer, Paver / Landscaper
- Electrical & Power (slug: electrical_power): Electrician, Solar Technician, Appliance Electrician, Generator Technician, CCTV / Security Installer
- Plumbing & Water Systems (slug: plumbing_water): Plumber, Borehole / Pump Technician, Drainage Worker, Sanitary Installer
- Auto & Mechanical Repairs (slug: auto_mechanical): Auto Mechanic, Auto Electrician, Vulcanizer, Sprayer / Auto Body Worker, Motorcycle Mechanic, Heavy Equipment Mechanic
- Home Repairs & Maintenance (slug: home_repairs): General Handyman, Furniture Repairer, Door/Window Repairer, Pest Control Worker, Cleaner, Gardener
- Beauty, Fashion & Personal Services (slug: beauty_fashion): Hairdresser, Barber, Makeup Artist, Tailor / Dressmaker, Shoemaker / Cobbler, Bead Maker, Milliner
- Electronics, Phones & IT Repairs (slug: electronics_it): Phone Repairer, Laptop Technician, TV Technician, Sound System Technician, Printer/Photocopier Technician
- Hospitality & Event Services (slug: hospitality_events): Caterer, Baker, Decorator, Photographer, Videographer, DJ / Sound Provider, Canopy/Chair Rental
- Arts, Craft & Traditional Work (slug: arts_crafts): Potter, Weaver, Wood Carver, Drum Maker, Goldsmith / Jeweller, Brass Smith, Signwriter / Printer`;

  const prompt = `You are an assistant for CraftMatch, a platform that connects clients to local artisans and service workers.
Your task is to parse a natural language query — which could be a client's search intent (e.g., "fix my sink", "need a painter") OR an artisan's described skills/trades (e.g., "I do house wiring and fix generators", "cabinet maker") — and output a structured JSON representing the matched categories and a refined summary of the query.

Here are the available service categories and their slugs:
${catalogPrompt}

You must return a JSON object with this exact shape:
{
  "categories": ["slug1", "slug2"], // Slugs of matching categories. Max 2-3 categories. Only use slugs from the active catalog above. If no category fits, return an empty array.
  "refinedQuery": "string", // A refined, cleaned version of the query suitable for matching/indexing (e.g., "electrical repair" or "carpentry work").
  "intentSummary": "string" // A concise human-readable description of the query's core skill/intent (e.g., "Generator repairs" or "Cabinet installation"). Max 5 words.
}

Do not include any Markdown tags, comments or other text outside of the raw JSON object.

Query: "${query.replace(/"/g, '\\"')}"
JSON Output:`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsed = JSON.parse(responseText);

  return {
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    refinedQuery: parsed.refinedQuery || query,
    intentSummary: parsed.intentSummary || query,
  };
}

function parseWithLocalFallback(
  query: string,
  catalog: readonly SearchIntentCatalogItem[] = [],
): ParsedIntent {
  const matches = findMatchingCategories(query, catalog);
  
  // If we have category matches above a threshold, use them
  const matchedSlugs = matches
    .filter(m => m.score >= 0.5)
    .slice(0, 2)
    .map(m => m.slug);

  // Simple query refining (removing common stopwords)
  const stopwords = new Set([
    "i", "need", "someone", "to", "my", "fix", "repair", "install", "help", "with", "a", "an", "the", "for", "please", "urgent", "urgently", "find", "me", "want", "looking"
  ]);
  const words = query.split(/\s+/);
  const refinedQuery = words
    .filter(w => !stopwords.has(w.toLowerCase().replace(/[^a-z]/g, "")))
    .join(" ");

  let intentSummary = query;
  if (matchedSlugs.length > 0) {
    const mainCategory = matchedSlugs[0].replace("_", " ");
    intentSummary = `${mainCategory.charAt(0).toUpperCase() + mainCategory.slice(1)} service`;
  }

  return {
    categories: matchedSlugs,
    refinedQuery: refinedQuery || query,
    intentSummary: intentSummary,
  };
}

function normalizeIntentAgainstCatalog(
  intent: ParsedIntent,
  query: string,
  catalog: readonly SearchIntentCatalogItem[],
): ParsedIntent {
  if (catalog.length === 0) return intent;

  const validSlugs = new Set(catalog.map((category) => category.slug));
  const categories = intent.categories.filter((slug) => validSlugs.has(slug));
  if (categories.length > 0) {
    return { ...intent, categories };
  }

  return parseWithLocalFallback(query, catalog);
}
