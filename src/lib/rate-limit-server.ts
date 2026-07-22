import "server-only";
import { createHash } from "node:crypto";
import { getSupabasePublicConfig } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";
import { getServerEnv } from "@/lib/server-env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export { clientKey, tooManyRequests } from "@/lib/rate-limit";

export async function allowPersistentRequest(
  key: string,
  limit: number,
  windowMs = 60_000,
): Promise<boolean> {
  if (!getSupabasePublicConfig()) return allowRequest(key, limit, windowMs);
  if (!getServerEnv().SUPABASE_SERVICE_ROLE_KEY) return false;
  const hashedKey = createHash("sha256").update(key).digest("hex");
  try {
    const { data, error } = await createAdminSupabaseClient().rpc(
      "consume_rate_limit",
      {
        p_key: hashedKey,
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      },
    );
    return !error && data === true;
  } catch {
    // Hosted protection fails closed if the persistent limiter is unavailable.
    return false;
  }
}
