import { Router, type Request, type Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { appError } from '../utils/appError';
import {
  searchPlaces,
  getPlaceDetails,
  reverseGeocode,
} from '../services/placesService';

const router = Router();

/**
 * GET /api/places/autocomplete
 * Query params: input (string, min 2 chars), country (string, optional, default 'gh')
 */
router.get(
  '/autocomplete',
  catchAsync(async (req: Request, res: Response) => {
    const input = typeof req.query.input === 'string' ? req.query.input.trim() : '';
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : 'gh';

    if (!input || input.length < 2) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const predictions = await searchPlaces(input, country);
    res.status(200).json({
      success: true,
      data: predictions,
    });
  })
);

/**
 * GET /api/places/details
 * Query params: place_id (string, required)
 */
router.get(
  '/details',
  catchAsync(async (req: Request, res: Response) => {
    const placeId = typeof req.query.place_id === 'string' ? req.query.place_id.trim() : '';
    if (!placeId) {
      throw appError(400, 'place_id is required', 'VALIDATION_ERROR');
    }

    const details = await getPlaceDetails(placeId);
    if (!details) {
      throw appError(404, 'Place details not found', 'NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: details,
    });
  })
);

/**
 * GET /api/places/reverse-geocode
 * Query params: lat (number, required), lng (number, required)
 */
router.get(
  '/reverse-geocode',
  catchAsync(async (req: Request, res: Response) => {
    const latStr = req.query.lat;
    const lngStr = req.query.lng;

    if (latStr === undefined || lngStr === undefined) {
      throw appError(400, 'lat and lng query parameters are required', 'VALIDATION_ERROR');
    }

    const lat = parseFloat(String(latStr));
    const lng = parseFloat(String(lngStr));

    if (isNaN(lat) || isNaN(lng)) {
      throw appError(400, 'lat and lng must be valid numbers', 'VALIDATION_ERROR');
    }

    const result = await reverseGeocode(lat, lng);
    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
