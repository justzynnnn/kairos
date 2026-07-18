import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";

const TEXT_LIMIT = 40;
const AUDIO_SECONDS_LIMIT = 300;
const previewUsage = new Map<string, { text: number; audio: number }>();

export async function reserveAIUsage(viewer: Viewer, kind: "text" | "audio", units: number) {
  const safeUnits = Math.max(1, Math.ceil(units));
  if (viewer.preview) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
    const key = `${viewer.id}:${day}`;
    const value = previewUsage.get(key) ?? { text: 0, audio: 0 };
    if (kind === "text" && value.text + safeUnits > TEXT_LIMIT) return false;
    if (kind === "audio" && value.audio + safeUnits > AUDIO_SECONDS_LIMIT) return false;
    value[kind] += safeUnits;
    previewUsage.set(key, value);
    return true;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reserve_ai_usage", { p_kind: kind, p_units: safeUnits });
  if (error) throw new Error("Unable to verify the AI usage allowance.");
  return Boolean(data);
}

export const AI_LIMITS = { textRequestsPerDay: TEXT_LIMIT, audioSecondsPerDay: AUDIO_SECONDS_LIMIT, maxRecordingSeconds: 60 } as const;

