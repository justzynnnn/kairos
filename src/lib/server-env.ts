import "server-only";
import { z } from "zod";
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(16).optional(),
);
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GEMINI_FALLBACK_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  GOOGLE_MAPS_API_KEY: optionalSecret,
  CRON_SECRET: optionalSecret,
});
export function getServerEnv() {
  return schema.parse({
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}
