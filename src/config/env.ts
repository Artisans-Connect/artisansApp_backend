import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFlag = z.preprocess(
  (value) => typeof value === "string" ? value.toLowerCase() : value,
  z.union([z.literal(true), z.literal(false), z.literal("true"), z.literal("false")])
    .transform((value) => value === true || value === "true"),
).default(false);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    VERIFICATION_ADMIN_KEY: z.string().min(8).optional(),
    FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    SMS_FALLBACK_ENABLED: booleanFlag,
    WHATSAPP_FALLBACK_ENABLED: booleanFlag,
    MOOLRE_API_BASE_URL: z.url().default("https://api.moolre.com"),
    MOOLRE_API_USER: z.string().min(1).optional(),
    MOOLRE_API_PUBKEY: z.string().min(1).optional(),
    MOOLRE_API_KEY: z.string().min(1).optional(),
    MOOLRE_API_VASKEY: z.string().min(1).optional(),
    MOOLRE_ACCOUNT_NUMBER: z.string().min(1).optional(),
    MOOLRE_PAYMENT_CHANNEL: z.enum(["13", "6", "7"]).default("13"),
    MOOLRE_SMS_SENDER_ID: z.string().min(1).max(11).optional(),
    // Legacy provider settings remain accepted for rollback during migration.
    HUBTEL_SMS_ENDPOINT: z.url().optional(),
    HUBTEL_CLIENT_ID: z.string().min(1).optional(),
    HUBTEL_CLIENT_SECRET: z.string().min(1).optional(),
    HUBTEL_SENDER_ID: z.string().min(1).max(11).optional(),
    PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_TEMPLATE_NAME: z.string().min(1).default("craftmatch_notification"),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(1).default("en"),
    NOTIFICATION_FALLBACK_DELAY_SECONDS: z.coerce.number().int().min(0).max(3600).default(30),
    NOTIFICATION_PROVIDER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(1),
  })
  .refine((data) => data.FIREBASE_SERVICE_ACCOUNT_PATH || data.FIREBASE_SERVICE_ACCOUNT_BASE64, {
    message: "Either FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64 is required",
    path: ["FIREBASE_SERVICE_ACCOUNT_PATH"],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;
