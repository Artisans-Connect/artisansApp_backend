import axios from "axios";
import { logger } from "../utils/logger";

export interface GnhrMemberRecord {
  member_uuid: string;
  household_uuid: string;
  mm_member_firstname: string;
  mm_member_lastname: string;
  mm_member_othername?: string;
  mm_member_photo?: string;
  mm_member_gender?: string;
  mm_dob?: string;
  mm_member_main_phone_number?: string;
  mm_member_nhis_card_number?: string;
  mm_region_code?: string;
  mm_district_code?: string;
  mm_community_code?: string;
  categorization?: string;
}

export interface GnhrLocationItem {
  code: string;
  name: string;
  capital?: string;
  parent_code?: string;
  leapId?: string | null;
  gpsCoordinate?: string | null;
  landmark_info?: string | null;
  focalPersonName?: string | null;
  focalPersonMobileNumber?: string | null;
  status?: string | null;
}

const GNHR_API_URL = process.env.GNHR_API_URL || "https://registry.mogcsp.gov.gh";
const GNHR_PARTNER_CODE = process.env.GNHR_PARTNER_CODE || "";
const GNHR_BEARER_TOKEN = process.env.GNHR_BEARER_TOKEN || "";

// In-memory cache for locations hierarchy
const locationCache = new Map<string, { data: GnhrLocationItem[]; expiresAt: number }>();
const LOCATIONS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Checks whether GNHR partner credentials are configured in the environment.
 */
export function isGnhrConfigured(): boolean {
  return Boolean(GNHR_PARTNER_CODE && GNHR_BEARER_TOKEN);
}

/**
 * Searches the GNHR registry for a member by Ghana Card PIN, phone, or name.
 * Gracefully reports unconfigured status if partner credentials are not yet assigned.
 */
export async function searchGnhrMember(query: string): Promise<{
  configured: boolean;
  successful: boolean;
  member?: GnhrMemberRecord;
  message?: string;
}> {
  if (!isGnhrConfigured()) {
    return {
      configured: false,
      successful: false,
      message: "GNHR partner integration is reserved. Add GNHR_PARTNER_CODE and GNHR_BEARER_TOKEN to activate live member lookups.",
    };
  }

  const cleanQuery = (query || "").trim();
  if (!cleanQuery) {
    return {
      configured: true,
      successful: false,
      message: "Search query is required",
    };
  }

  try {
    const response = await axios.get(`${GNHR_API_URL}/api/v2/members`, {
      params: {
        partnerCode: GNHR_PARTNER_CODE,
        search: cleanQuery,
        limit: 10,
      },
      headers: {
        Authorization: `Bearer ${GNHR_BEARER_TOKEN}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });

    if (response.status === 200 && response.data?.successful) {
      const list = response.data.data;
      if (Array.isArray(list) && list.length > 0) {
        return {
          configured: true,
          successful: true,
          member: list[0] as GnhrMemberRecord,
        };
      }
    }

    return {
      configured: true,
      successful: false,
      message: "No matching member record found in GNHR registry",
    };
  } catch (error: any) {
    logger("GNHR member search error:", error?.message || error);
    return {
      configured: true,
      successful: false,
      message: error?.response?.data?.error?.message || "Failed to contact GNHR member registry",
    };
  }
}

/**
 * Queries the public GNHR location hierarchy (Regions, Districts, Communities).
 * No partner authentication required for locations.
 */
export async function getGnhrLocations(
  type: "R" | "D" | "C",
  parentCode?: string
): Promise<GnhrLocationItem[]> {
  const cacheKey = `${type}_${parentCode || "all"}`;
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const params: Record<string, string> = { type };
    if (parentCode) {
      params.parent_code = parentCode.trim();
    }

    const response = await axios.get(`${GNHR_API_URL}/api/locations`, {
      params,
      headers: { Accept: "application/json" },
      timeout: 10000,
    });

    if (response.status === 200 && Array.isArray(response.data?.data)) {
      const items = response.data.data as GnhrLocationItem[];
      locationCache.set(cacheKey, {
        data: items,
        expiresAt: Date.now() + LOCATIONS_CACHE_TTL,
      });
      return items;
    }
  } catch (error: any) {
    logger("GNHR locations query failed:", error?.message || error);
  }

  return [];
}
