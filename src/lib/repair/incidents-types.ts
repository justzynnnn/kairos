import type { RepairOperation, RepairTrigger } from "@/lib/repair/types";

export type RepairIncidentStatus = "applied" | "needs_attention" | "undone";
export type RepairIncident = {
  id: string;
  trigger: RepairTrigger;
  reason: string;
  delayMinutes: number;
  status: RepairIncidentStatus;
  operations: RepairOperation[];
  createdAt: string;
  canUndo: boolean;
  journeySessionId?: string | null;
};

export type DayStartResult = {
  dayStarted: boolean;
  firstOpen: boolean;
  broken: boolean;
  incident: RepairIncident | null;
};
