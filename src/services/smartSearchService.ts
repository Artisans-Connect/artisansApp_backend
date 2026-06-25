import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { findMatchingCategories } from "../utils/skillMatch";

export interface ParsedIntent {
  categories: string[];
  refinedQuery: string;
  intentSummary: string;
}

// In-memory cache for search intent (10 minutes TTL)
interface CacheEntry {
  intent: ParsedIntent;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function parseSearchIntent(query: string): Promise<ParsedIntent> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { categories: [], refinedQuery: "", intentSummary: "" };
  }

  // Check cache
  const cached = cache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.intent;
  }

  let result: ParsedIntent;

  if (env.GEMINI_API_KEY) {
    try {
      result = await parseWithGemini(query);
    } catch (error) {
      console.error("Gemini parse failed, falling back to local matching:", error);
      result = parseWithLocalFallback(query);
    }
  } else {
    result = parseWithLocalFallback(query);
  }

  // Cache result
  cache.set(normalizedQuery, {
    intent: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

async function parseWithGemini(query: string): Promise<ParsedIntent> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  // Using gemini-2.0-flash for high speed and reliable JSON output
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = `You are an assistant for CraftMatch, a platform that connects clients to local artisans and service workers.
Your task is to parse a natural language query — which could be a client's search intent (e.g., "fix my sink", "need a painter") OR an artisan's described skills/trades (e.g., "I do house wiring and fix generators", "cabinet maker") — and output a structured JSON representing the matched categories and a refined summary of the query.

Here are the available service categories and their slugs:
- Plumbing (slug: plumbing): Leak repair, Installation, Drainage & septic
- Electrical (slug: electrical): Wiring, Repairs, Generator & inverter
- Carpentry (slug: carpentry): Furniture, Frames & doors, Cabinets & wardrobes
- Masonry & Blockwork (slug: masonry): Block laying, Plastering, Concrete repair
- Welding & Fabrication (slug: welding): Metal gates, Burglar proofing, Fabrication repair
- Construction & Renovation (slug: construction): Renovation, Structural repair, Site labour
- Automotive & Small Engine (slug: automotive): Car mechanic, Motorbike repair, Auto body & spraying
- Painting (slug: painting): Interior, Exterior, Decorative finish
- Tiling & Flooring (slug: tiling): Floor tiling, Wall tiling, Terrazzo & floor finish
- Roofing & Ceiling (slug: roofing): Roof installation, Ceiling work, Roof leak repair
- HVAC & Refrigeration (slug: hvac): AC service, Refrigeration, Ventilation
- Appliance & Electronics Repair (slug: appliance_repair): Kitchen appliances, Laundry appliances, Electronics repair
- Cleaning (slug: cleaning): Deep clean, Move-in/out, Fumigation & pest control
- Landscaping (slug: landscaping): Lawn care, Garden design, Compound cleanup
- Fashion & Dressmaking (slug: fashion): Dressmaking, Alterations, School & work uniforms, Shoemaking & shoe repair (cobbler), Leatherwork & footwear
- Hair & Beauty (slug: beauty): Hairdressing, Barbering, Makeup & nails
- Catering & Events (slug: catering): Home cooking, Baking, Event catering, Butcher & meat preparation, Animal slaughtering
- Upholstery (slug: upholstery): Sofa repair, Curtains & blinds, Cushions & covers
- Security & Locksmith (slug: security): Locksmith, Burglar proofing, CCTV & access
- ICT & Device Support (slug: ict_support): Computer repair, Phone repair, Network setup

You must return a JSON object with this exact shape:
{
  "categories": ["slug1", "slug2"], // Slugs of matching categories. Max 2-3 categories. If no category fits, return an empty array.
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

function parseWithLocalFallback(query: string): ParsedIntent {
  const matches = findMatchingCategories(query);
  
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
