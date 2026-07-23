import { readLocalSnapshot } from "@/lib/mobile/store";
import { mobileConfig } from "./config";

export const launchStartedAt = performance.now();

// Metrics fire on launch and on every tab change; reading the flag through the
// native bridge each time is a per-interaction round-trip for a value that only
// changes from the settings toggle.
let diagnosticsEnabled: boolean | null = null;
const diagnosticsKey = "diagnostics-enabled";

export function setDiagnosticsEnabled(enabled: boolean) {
  diagnosticsEnabled = enabled;
}

async function diagnosticsAllowed() {
  if (diagnosticsEnabled === null)
    diagnosticsEnabled = Boolean(
      await readLocalSnapshot<boolean>(diagnosticsKey),
    );
  return diagnosticsEnabled;
}

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
  if (!(await diagnosticsAllowed())) return;
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
