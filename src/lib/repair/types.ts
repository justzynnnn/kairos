import type { CalendarItem } from "@/lib/types";

export type RepairTrigger = "fix_day" | "woke_late" | "running_behind" | "missed_start";
export type RepairOperationKind = "move" | "shorten" | "split" | "skip";
export type RepairSegment = { startAt: string; endAt: string; durationMinutes: number };
export type RepairOperation = {
  id: string;
  itemId: string;
  title: string;
  kind: RepairOperationKind;
  before: RepairSegment[];
  after: RepairSegment[];
  explanation: string;
  requiresProtectedApproval: boolean;
};
export type RepairScore = {
  hardConstraintViolations: number;
  missedDeadlineWeight: number;
  highPriorityDisplacement: number;
  disruptionMinutes: number;
  travelPenalty: number;
  preferencePenalty: number;
  optionalSkipped: number;
};
export type RepairAlternative = {
  id: string;
  label: string;
  recommended: boolean;
  explanation: string;
  operations: RepairOperation[];
  score: RepairScore;
  resultingItems: CalendarItem[];
};
export type RepairRequest = {
  trigger: RepairTrigger;
  delayMinutes: number;
  revision?: string;
  now?: Date;
  activeStart?: string;
  activeEnd?: string;
};
export type RepairSolution =
  | { status: "proposal"; alternatives: RepairAlternative[] }
  | { status: "impossible"; reason: string; compromises: string[] };

