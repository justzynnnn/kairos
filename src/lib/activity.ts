import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";
import { listPreviewActivity } from "@/lib/profile/preview-store";
export type ActivityDay = {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
  count: number;
};
function dates() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 83);
  return Array.from({ length: 84 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value.toISOString().slice(0, 10);
  });
}
export async function getActivityDays(viewer: Viewer): Promise<ActivityDay[]> {
  const days = dates(),
    counts = new Map<string, number>();
  if (!isSupabaseConfigured()) {
    for (const event of listPreviewActivity().filter(
      (entry) => entry.userId === viewer.id,
    )) {
      const date = event.createdAt.slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + event.score);
    }
  } else {
    const supabase = await createServerSupabaseClient(),
      since = `${days[0]}T00:00:00.000Z`,
      { data } = await supabase
        .from("private_activity_events")
        .select("created_at,score")
        .gte("created_at", since)
        .order("created_at");
    for (const event of data ?? []) {
      const date = String(event.created_at).slice(0, 10);
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
