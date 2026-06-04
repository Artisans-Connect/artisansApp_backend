import { z } from "zod";

export const createProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1),
  signup_type: z.enum(["client", "worker"]),
  avatar_url: z.string().url().optional(),
  skills: z.array(z.string().trim().min(1)).default([]),
  hourly_rate: z.number().positive().optional(),
  rate_type: z.enum(["hourly", "fixed"]).default("hourly"),
  service_areas: z.array(z.string().trim().min(1)).default([]),
  bio: z.string().trim().max(500).optional(),
  location_label: z.string().trim().optional(),
  experience_band: z.string().trim().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(1).optional(),
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().trim().max(500).optional(),
  location_label: z.string().trim().optional(),
});

export const fcmTokenSchema = z.object({
  fcm_token: z.string().trim().min(1),
});

export const updateModeSchema = z.object({
  mode: z.enum(["client", "worker"]),
});

export const onboardWorkerSchema = z.object({
  skills: z.array(z.string().trim().min(1)).min(1),
  service_areas: z.array(z.string().trim().min(1)).min(1),
  experience_band: z.string().trim().optional(),
  bio: z.string().trim().max(500).optional(),
  avatar_url: z.string().url().optional(),
  location_label: z.string().trim().optional(),
});
