import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

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
