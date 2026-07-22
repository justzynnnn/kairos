import "server-only";
import { z } from "zod";
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(16).optional(),
);
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_SCHEDULING_MODEL: z.string().min(1).default("gpt-5.6-sol"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-4o-transcribe"),
  GOOGLE_MAPS_API_KEY: optionalSecret,
  CRON_SECRET: optionalSecret,
});
export function getServerEnv() {
  return schema.parse({
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_SCHEDULING_MODEL: process.env.OPENAI_SCHEDULING_MODEL,
    OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}
