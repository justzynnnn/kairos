import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { fromDateTimeLocal, localDateKey } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";
import { listPreviewActivity } from "@/lib/profile/preview-store";
import type { ActivityDay } from "@/lib/activity-utils";

function dates(timezone: string) {
  const end = localDateKey(new Date(), timezone);
  const start = new Date(`${end}T12:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 83);
  return Array.from({ length: 84 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
}
export async function getActivityDays(viewer: Viewer): Promise<ActivityDay[]> {
  const days = dates(viewer.timezone),
    counts = new Map<string, number>();
  if (!isSupabaseConfigured()) {
    for (const event of listPreviewActivity().filter(
      (entry) => entry.userId === viewer.id,
    )) {
      const date = localDateKey(event.createdAt, viewer.timezone);
      counts.set(date, (counts.get(date) ?? 0) + event.score);
    }
  } else {
    const supabase = await createServerSupabaseClient(),
      since = fromDateTimeLocal(`${days[0]}T00:00`, viewer.timezone),
      { data } = await supabase
        .from("private_activity_events")
        .select("created_at,score")
        .eq("user_id", viewer.id)
        .gte("created_at", since ?? `${days[0]}T00:00:00.000Z`)
        .order("created_at");
    for (const event of data ?? []) {
      const date = localDateKey(String(event.created_at), viewer.timezone);
      counts.set(date, (counts.get(date) ?? 0) + Number(event.score));
    }
  }
  return days.map((date) => {
    const count = counts.get(date) ?? 0;
    return {
      date,
      count,
      level: Math.min(4, Math.ceil(count / 2)) as 0 | 1 | 2 | 3 | 4,
    };
  });
}
