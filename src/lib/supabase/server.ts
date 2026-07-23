import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * The Authorization header of the request being served, when it carries a
 * mobile bearer token. The phone cannot present cookies, so this is how a
 * request from the iOS client is told apart from a browser one.
 */
export async function requestBearerAuthorization() {
  const value = (await headers()).get("authorization");
  return value?.startsWith("Bearer ") ? value : null;
}

export async function createServerSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured.");
  // A bearer request gets a token-scoped client instead of the cookie one, so
  // every engine in src/lib/** works unchanged for the phone. RLS scoping is
  // identical either way: both clients are the anon key acting as one user.
  const authorization = await requestBearerAuthorization();
  if (authorization)
    return createClient(config.url, config.anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {}
      },
    },
  });
}
