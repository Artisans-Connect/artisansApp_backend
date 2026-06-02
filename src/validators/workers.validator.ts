import { z } from "zod";

export const updateLocationSchema = z.object({
  current_lat: z.number().min(-90).max(90),
  current_lng: z.number().min(-180).max(180),
});

export const updateAvailabilitySchema = z.object({
  is_available: z.boolean(),
});

export const nearbyWorkersSchema = z.object({
  category_id: z.string().uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().positive().max(100).default(15),
  limit: z.coerce.number().positive().max(50).default(20),
});

export const updateWorkerProfileSchema = z.object({
  skills: z.array(z.string().trim().min(1)).optional(),
  hourly_rate: z.number().positive().optional(),
  rate_type: z.enum(["hourly", "fixed"]).optional(),
  service_areas: z.array(z.string().trim().min(1)).optional(),
});
