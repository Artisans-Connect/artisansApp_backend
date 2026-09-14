import axios from "axios";
import { logger } from "../utils/logger";

export interface GhanaPostLocation {
  gpsName: string;
  lat: number;
  lng: number;
  region?: string;
  district?: string;
  area?: string;
}

const GHANAPOST_URL = process.env.GHANAPOST_API_URL || "https://ghanapostgps.sperixlabs.org";

// In-memory cache for resolved addresses with 24-hour TTL to reduce outbound calls
const resolveCache = new Map<string, { data: GhanaPostLocation; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes a GhanaPost GPS address input into standard format (e.g. GA-183-9024).
 * Handles inputs without dashes (e.g. "ga1839024" -> "GA-183-9024"),
 * spaced inputs (e.g. "GA 183 9024" -> "GA-183-9024"),
 * partial dashes (e.g. "GA-183 9024" or "ga183-9024"),
 * and already formatted inputs.
 */
export function normalizeGhanaPostCode(input: string): string | null {
  if (!input || typeof input !== "string") return null;

  // 1. Check direct standard format (e.g. GA-183-9024 or GA-1834-9024)
  const directMatch = input.trim().toUpperCase().match(/^([A-Z]{2})-(\d{3,5})-(\d{4})$/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  // 2. Strip all non-alphanumeric characters and uppercase
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // 3. Must start with 2 letters followed by 7 to 9 digits
  const match = raw.match(/^([A-Z]{2})(\d{7,9})$/);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  const digits = match[2];

  // The unique property code is always the last 4 digits
  const propertyCode = digits.slice(-4);
  // The postal district is everything between prefix and property code (3 to 5 digits)
  const districtCode = digits.slice(0, -4);

  if (districtCode.length < 3 || districtCode.length > 5) {
    return null;
  }

  return `${prefix}-${districtCode}-${propertyCode}`;
}

/**
 * Validates the syntax of a GhanaPost GPS code (with or without dashes).
 */
export function isValidGhanaPostCode(code: string): boolean {
  return normalizeGhanaPostCode(code) !== null;
}

/**
 * Resolves a GhanaPost GPS address code to geographic coordinates, district, and region.
 */
export async function resolveGhanaPostAddress(code: string): Promise<GhanaPostLocation | null> {
  const cleanCode = normalizeGhanaPostCode(code);
  if (!cleanCode) {
    return null;
  }

  // Check cache
  const cached = resolveCache.get(cleanCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    params.append("address", cleanCode);

    const response = await axios.post(`${GHANAPOST_URL}/get-location`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8000,
    });

    if (response.status === 200 && response.data?.found) {
      const table = response.data?.data?.Table;
      if (Array.isArray(table) && table.length > 0) {
        const item = table[0];
        const lat = parseFloat(item.CenterLatitude);
        const lng = parseFloat(item.CenterLongitude);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const locationData: GhanaPostLocation = {
            gpsName: cleanCode,
            lat,
            lng,
            region: typeof item.Region === "string" ? item.Region.trim() : undefined,
            district: typeof item.District === "string" ? item.District.trim() : undefined,
            area: typeof item.Area === "string" ? item.Area.trim() : undefined,
          };

          // Cache result
          resolveCache.set(cleanCode, {
            data: locationData,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          return locationData;
        }
      }
    }
  } catch (error) {
    logger("GhanaPostGPS resolve failed or timed out", error, cleanCode);
  }

  return null;
}

/**
 * Reverse geocodes latitude and longitude coordinates into a GhanaPost GPS digital address.
 */
export async function reverseGhanaPostCoordinates(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  try {
    const roundedLat = lat.toFixed(5);
    const roundedLng = lng.toFixed(5);

    const params = new URLSearchParams();
    params.append("lat", roundedLat);
    params.append("long", roundedLng);

    const response = await axios.post(`${GHANAPOST_URL}/get-address`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8000,
    });

    if (response.status === 200 && response.data?.found) {
      const table = response.data?.data?.Table;
      if (Array.isArray(table) && table.length > 0) {
        const gpsName = table[0].GPSName;
        if (typeof gpsName === "string" && gpsName.trim()) {
          return gpsName.trim();
        }
      }
    }
  } catch (error) {
    logger("GhanaPostGPS reverse lookup failed or timed out", error, lat, lng);
  }

  return null;
}
