import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";

const TEXT_LIMIT = 40;
const previewUsage = new Map<string, number>();

export async function reserveAIUsage(viewer: Viewer, units: number) {
  const safeUnits = Math.max(1, Math.ceil(units));
  if (viewer.preview) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: viewer.timezone,
    }).format(new Date());
    const key = `${viewer.id}:${day}`;
    const value = previewUsage.get(key) ?? 0;
    if (value + safeUnits > TEXT_LIMIT) return false;
    previewUsage.set(key, value + safeUnits);
    return true;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_kind: "text",
    p_units: safeUnits,
  });
  if (error) throw new Error("Unable to verify the AI usage allowance.");
  return Boolean(data);
}

export const AI_LIMITS = {
  textRequestsPerDay: TEXT_LIMIT,
} as const;
