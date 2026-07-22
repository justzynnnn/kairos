import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";
import { AppError } from "@/lib/http";

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length >= 20 && token.length <= 4096 ? token : null;
}

export async function authenticateBearerRequest(request: Request) {
  const config = getSupabasePublicConfig();
  const token = bearerToken(request);
  if (!config || !token) throw new AppError("Authentication required.", 401);
  const client = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new AppError("Your mobile session has expired.", 401);
  return { client, user: data.user, token };
}
