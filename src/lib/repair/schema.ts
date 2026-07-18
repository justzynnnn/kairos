import { z } from "zod";

export const repairRequestSchema=z.object({
  trigger:z.enum(["fix_day","woke_late","running_behind","missed_start"]),
  delayMinutes:z.number().int().min(15).max(360).default(45),
  revision:z.string().trim().max(500).optional(),
});
export const confirmRepairSchema=z.object({
  proposalId:z.string().uuid(),
  alternativeId:z.string().min(1).max(80),
  baseScheduleVersion:z.number().int().positive(),
});

