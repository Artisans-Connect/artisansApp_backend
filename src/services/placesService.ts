import axios from 'axios';
import { appError } from '../utils/appError';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const autocompleteCache = new Map<string, CacheEntry<any>>();
const detailsCache = new Map<string, CacheEntry<any>>();
const geocodeCache = new Map<string, CacheEntry<any>>();

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  // Simple size protection
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw appError(500, 'GOOGLE_MAPS_API_KEY is not configured on server', 'CONFIG_ERROR');
  }
  return key;
}

export interface PlacePrediction {
  place_id: string;
  description: string;
  main_text?: string;
  secondary_text?: string;
}

export async function searchPlaces(
  input: string,
  country = 'gh'
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  const cacheKey = `${country.toLowerCase()}:${trimmed.toLowerCase()}`;
  const cached = getFromCache<PlacePrediction[]>(autocompleteCache, cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = getApiKey();
  const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';

  const response = await axios.get(url, {
    params: {
      input: trimmed,
      key: apiKey,
      components: `country:${country}`,
    },
    timeout: 7000,
  });

  const data = response.data;
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('Google Places Autocomplete error:', data.status, data.error_message);
    throw appError(
      502,
      `Google Places upstream error: ${data.error_message || data.status}`,
      'UPSTREAM_ERROR'
    );
  }

  const predictions: PlacePrediction[] = (data.predictions || []).map((item: any) => ({
    place_id: String(item.place_id || ''),
    description: String(item.description || ''),
    main_text: item.structured_formatting?.main_text || undefined,
    secondary_text: item.structured_formatting?.secondary_text || undefined,
  }));

  setInCache(autocompleteCache, cacheKey, predictions);
  return predictions;
}

export interface PlaceDetails {
  position: {
    lat: number;
    lng: number;
  };
  address: string;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const trimmed = placeId.trim();
  if (!trimmed) {
    return null;
  }

  const cached = getFromCache<PlaceDetails>(detailsCache, trimmed);
  if (cached) {
    return cached;
  }

  const apiKey = getApiKey();
  const url = 'https://maps.googleapis.com/maps/api/place/details/json';

  const response = await axios.get(url, {
    params: {
      place_id: trimmed,
      fields: 'formatted_address,geometry',
      key: apiKey,
    },
    timeout: 7000,
  });

  const data = response.data;
  if (data.status !== 'OK') {
    console.error('Google Place Details error:', data.status, data.error_message);
    return null;
  }

  const loc = data.result?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return null;
  }

  const result: PlaceDetails = {
    position: {
      lat: loc.lat,
      lng: loc.lng,
    },
    address: data.result?.formatted_address || '',
  };

  setInCache(detailsCache, trimmed, result);
  return result;
}

export interface ReverseGeocodeResult {
  formatted_address: string;
  city?: string;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = getFromCache<ReverseGeocodeResult>(geocodeCache, cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = getApiKey();
  const url = 'https://maps.googleapis.com/maps/api/geocode/json';

  const response = await axios.get(url, {
    params: {
      latlng: `${lat},${lng}`,
      key: apiKey,
    },
    timeout: 7000,
  });

  const data = response.data;
  if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const first = data.results[0];
  const address = first?.formatted_address || '';

  let city: string | undefined;
  for (const res of data.results) {
    if (!Array.isArray(res.address_components)) continue;
    for (const comp of res.address_components) {
      const types = comp.types || [];
      if (types.includes('locality')) {
        city = comp.long_name;
        break;
      } else if (types.includes('administrative_area_level_2') && !city) {
        city = comp.long_name;
      } else if (types.includes('administrative_area_level_1') && !city) {
        city = comp.long_name;
      }
    }
    if (city) break;
  }

  const result: ReverseGeocodeResult = {
    formatted_address: address,
    city,
  };

  setInCache(geocodeCache, cacheKey, result);
  return result;
}
