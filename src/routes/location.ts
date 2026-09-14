import { Router, Request, Response } from "express";
import {
  resolveGhanaPostAddress,
  reverseGhanaPostCoordinates,
  isValidGhanaPostCode,
  normalizeGhanaPostCode,
} from "../services/ghanaPostGpsService";
import {
  isGnhrConfigured,
  searchGnhrMember,
  getGnhrLocations,
} from "../services/gnhrService";
import { appError } from "../utils/appError";

export const locationRouter = Router();

/**
 * Health check for location service
 */
locationRouter.get("/ghanapost/health", (_req: Request, res: Response) => {
  res.json({ success: true, status: "ok" });
});

/**
 * Resolve GhanaPost GPS digital address to geographic coordinates, district, and region.
 * Automatically formats dashless (e.g. GA1839024) and spaced inputs.
 */
locationRouter.get("/ghanapost/resolve", async (req: Request, res: Response, next) => {
  try {
    const rawCode = String(req.query.code || "").trim();

    if (!rawCode) {
      throw appError(400, "GhanaPost GPS code is required", "MISSING_CODE");
    }

    const normalized = normalizeGhanaPostCode(rawCode);

    if (!normalized) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FORMAT",
          message: "Invalid GhanaPost GPS format. Example: AK-039-5028 or GA1839024",
          user_friendly: true,
        },
      });
    }

    const data = await resolveGhanaPostAddress(normalized);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Digital address could not be found or verified",
          user_friendly: true,
        },
      });
    }

    return res.json({
      success: true,
      meta: {
        source: "ghanapostgps",
        raw_code: rawCode,
        normalized_code: normalized,
      },
      data,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Reverse geocode coordinates to GhanaPost GPS digital address
 */
locationRouter.get("/ghanapost/reverse", async (req: Request, res: Response, next) => {
  try {
    const latStr = String(req.query.lat || "").trim();
    const lngStr = String(req.query.lng || "").trim();

    if (!latStr || !lngStr) {
      throw appError(400, "Latitude and Longitude query parameters are required", "MISSING_COORDINATES");
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw appError(400, "Invalid coordinate values", "INVALID_COORDINATES");
    }

    const gpsName = await reverseGhanaPostCoordinates(lat, lng);

    if (!gpsName) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NO_DIGITAL_ADDRESS",
          message: "No digital address found for given coordinates",
          user_friendly: true,
        },
      });
    }

    return res.json({
      success: true,
      meta: { source: "ghanapostgps" },
      data: {
        gpsName,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Check GNHR Integration status
 */
locationRouter.get("/gnhr/status", (_req: Request, res: Response) => {
  const configured = isGnhrConfigured();
  res.json({
    success: true,
    data: {
      configured,
      status: configured ? "ACTIVE" : "RESERVED",
      message: configured
        ? "GNHR live member registry is configured and active."
        : "GNHR member registry integration place is reserved. Public locations endpoints are active.",
    },
  });
});

/**
 * GNHR Member Registry Search (Instant KYC Auto-Fill)
 */
locationRouter.get("/gnhr/member-search", async (req: Request, res: Response, next) => {
  try {
    const query = String(req.query.query || "").trim();
    if (!query) {
      throw appError(400, "Search query (Ghana Card PIN or Phone) is required", "MISSING_QUERY");
    }

    const result = await searchGnhrMember(query);
    return res.json({
      success: result.successful,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GNHR Location Cascade (Regions, Districts, Communities)
 */
locationRouter.get("/gnhr/locations", async (req: Request, res: Response, next) => {
  try {
    const type = String(req.query.type || "R").toUpperCase() as "R" | "D" | "C";
    const parentCode = req.query.parent_code ? String(req.query.parent_code) : undefined;

    if (!["R", "D", "C"].includes(type)) {
      throw appError(400, "Invalid location type. Must be 'R', 'D', or 'C'", "INVALID_TYPE");
    }

    const data = await getGnhrLocations(type, parentCode);
    return res.json({
      success: true,
      meta: { source: "gnhr_registry", type, parent_code: parentCode || null },
      quantity: data.length,
      data,
    });
  } catch (err) {
    next(err);
  }
});

