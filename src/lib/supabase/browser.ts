import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/env";
export function createBrowserSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return createBrowserClient(config.url, config.anonKey);
}
