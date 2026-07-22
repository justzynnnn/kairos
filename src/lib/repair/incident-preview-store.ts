import { randomUUID } from "node:crypto";
import {
  getDemoCalendarItems,
  getDemoScheduleVersion,
  replaceDemoCalendarItems,
} from "@/lib/demo-data";
import {
  buildRepairSolution,
  validateRepairAlternative,
} from "@/lib/repair/engine";
import type { RepairIncident } from "@/lib/repair/incidents-types";
import type { RepairRequest } from "@/lib/repair/types";
import type { CalendarItem } from "@/lib/types";

type StoredIncident = {
  value: RepairIncident;
  before: CalendarItem[];
  appliedVersion: number;
  sourceKey: string;
  localDate: string;
  dismissed: boolean;
};
type PreviewState = {
  dayStarts: Set<string>;
  incidents: Map<string, StoredIncident>;
};
const previewGlobal = globalThis as typeof globalThis & {
  __kairosRepairIncidents?: PreviewState;
};
function state() {
  return (previewGlobal.__kairosRepairIncidents ??= {
    dayStarts: new Set(),
    incidents: new Map(),
  });
}

export function recordPreviewDayStart(day: string) {
  const fresh = !state().dayStarts.has(day);
  state().dayStarts.add(day);
  return fresh;
}
export function getPreviewIncident(id: string) {
  const entry = state().incidents.get(id);
  return entry && !entry.dismissed && entry.value.status !== "undone"
    ? entry.value
    : null;
}
export function latestPreviewIncident(
  options: {
    trigger?: RepairIncident["trigger"];
    localDate?: string;
    journeySessionId?: string;
    includeResolved?: boolean;
  } = {},
) {
  return (
    [...state().incidents.values()]
      .filter(
        (entry) =>
          (options.includeResolved ||
            (!entry.dismissed && entry.value.status !== "undone")) &&
          (!options.trigger || entry.value.trigger === options.trigger) &&
          (!options.localDate || entry.localDate === options.localDate) &&
          (!options.journeySessionId ||
            entry.value.journeySessionId === options.journeySessionId),
      )
      .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))[0]
      ?.value ?? null
  );
}

export function applyPreviewAutomaticRepair(
  request: RepairRequest,
  reason: string,
  sourceKey: string,
  localDate: string,
  journeySessionId: string | null = null,
): RepairIncident | null {
  const duplicate = [...state().incidents.values()].find(
    (entry) => entry.sourceKey === sourceKey,
  );
  if (duplicate)
    return duplicate.dismissed || duplicate.value.status === "undone"
      ? null
      : duplicate.value;
  const before = getDemoCalendarItems(),
    baseVersion = getDemoScheduleVersion(),
    solution = buildRepairSolution(before, request);
  if (solution.status === "impossible") {
    const value: RepairIncident = {
      id: randomUUID(),
      trigger: request.trigger,
      reason: `${reason} ${solution.reason}`,
      delayMinutes: request.delayMinutes,
      status: "needs_attention",
      operations: [],
      createdAt: new Date().toISOString(),
      canUndo: false,
      journeySessionId,
    };
    state().incidents.set(value.id, {
      value,
      before,
      appliedVersion: baseVersion,
      sourceKey,
      localDate,
      dismissed: false,
    });
    return value;
  }
  const alternative =
    solution.alternatives.find((entry) => entry.recommended) ??
    solution.alternatives[0];
  if (!alternative?.operations.length) return null;
  validateRepairAlternative(before, alternative);
  if (!replaceDemoCalendarItems(alternative.resultingItems, baseVersion))
    throw new Error("Your schedule changed. Try the repair again.");
  const value: RepairIncident = {
    id: randomUUID(),
    trigger: request.trigger,
    reason,
    delayMinutes: request.delayMinutes,
    status: "applied",
    operations: alternative.operations,
    createdAt: new Date().toISOString(),
    canUndo: true,
    journeySessionId,
  };
  state().incidents.set(value.id, {
    value,
    before,
    appliedVersion: baseVersion + 1,
    sourceKey,
    localDate,
    dismissed: false,
  });
  return value;
}

export function undoPreviewAutomaticRepair(id: string) {
  const entry = state().incidents.get(id);
  if (!entry || entry.value.status !== "applied")
    throw new Error("This repair can no longer be undone.");
  if (getDemoScheduleVersion() !== entry.appliedVersion)
    throw new Error(
      "Your schedule changed after this repair, so Undo is no longer safe.",
    );
  if (!replaceDemoCalendarItems(entry.before, entry.appliedVersion))
    throw new Error(
      "Your schedule changed after this repair, so Undo is no longer safe.",
    );
  entry.value = { ...entry.value, status: "undone", canUndo: false };
  return entry.value;
}
export function dismissPreviewRepairIncident(id: string) {
  const entry = state().incidents.get(id);
  if (!entry) return false;
  entry.dismissed = true;
  return true;
}
export function resetPreviewRepairIncidents() {
  delete previewGlobal.__kairosRepairIncidents;
}
