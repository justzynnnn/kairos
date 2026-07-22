import { readLocalSnapshot } from "@/lib/mobile/store";
import { mobileConfig } from "./config";

export const launchStartedAt = performance.now();

export function metricNow() {
  return performance.now();
}

export async function recordMetric(
  accessToken: string,
  event:
    | "launch_usable"
    | "tab_transition"
    | "interaction_feedback"
    | "transcript_update"
    | "planner_response"
    | "bootstrap"
    | "sync",
  durationMs: number | null,
  properties: Record<string, string | number> = {},
) {
  if (!(await readLocalSnapshot<boolean>("diagnostics-enabled"))) return;
  await fetch(mobileConfig.apiOrigin + "/api/mobile/diagnostics", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event,
      durationMs: durationMs === null ? null : Math.round(durationMs),
      properties: { platform: "ios", ...properties },
    }),
  }).catch(() => null);
}
