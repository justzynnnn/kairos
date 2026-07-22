import { z } from "zod";
export const schedulingActionSchema = z.object({
  kind: z.enum(["event", "task", "deadline", "preparation"]),
  title: z.string().min(1).max(160),
  category: z.string().min(1).max(60),
  location_label: z.string().max(240).nullable(),
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  due_at: z.string().nullable(),
  duration_minutes: z.number().int().positive().max(720).nullable(),
  total_effort_minutes: z.number().int().positive().max(2400).nullable(),
  session_length_minutes: z.number().int().positive().max(480).nullable(),
  block_count: z.number().int().positive().max(20).nullable(),
  after_title: z.string().max(160).nullable(),
  related_deadline_title: z.string().max(160).nullable(),
  flexibility: z.enum(["fixed", "protected", "flexible"]),
  can_shorten: z.boolean(),
  can_split: z.boolean(),
  can_skip: z.boolean(),
  priority: z.number().int().min(1).max(5),
  reminder_minutes: z.number().int().min(0).max(10080),
  assumptions: z.array(z.string().max(240)).max(8),
});
export const schedulingIntentSchema = z.object({
  summary: z.string().min(1).max(300),
  ambiguity: z.boolean(),
  follow_up_kind: z.enum(["none", "clarify", "deadline_preparation"]),
  essential_question: z.string().max(400).nullable(),
  assumptions: z.array(z.string().max(240)).max(12),
  external_send_authorized: z.literal(false),
  actions: z.array(schedulingActionSchema).min(1).max(20),
});
export const deadlinePreparationSchema = z.object({
  mode: z.enum(["one", "multiple"]),
  totalEffortMinutes: z.number().int().min(15).max(2400),
  sessionLengthMinutes: z.number().int().min(15).max(480),
});
// Compact compatibility hint for non-Foundation-Models clients. The native
// iOS bridge uses Swift @Generable structures and submits a fully typed intent.
export const commandHintSchema = z.object({
  kind: z.enum(["event", "task", "deadline", "preparation"]),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  when: z.string().trim().max(80).nullable(),
  duration_minutes: z.number().int().positive().max(720).nullable(),
});
export const interpretRequestSchema = z.object({
  command: z.string().trim().min(2).max(2000),
  clarification: z.string().trim().max(1000).optional(),
  deadlinePreparation: deadlinePreparationSchema.optional(),
  hint: commandHintSchema.optional(),
  nativeIntent: schedulingIntentSchema.optional(),
});
export const cloudInterpretRequestSchema = interpretRequestSchema
  .omit({ hint: true, nativeIntent: true })
  .extend({ consentGranted: z.literal(true) });
export const proposalItemSchema = z.object({
  clientId: z.string().min(1).max(80),
  type: z.enum(["event", "task", "deadline", "preparation"]),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  locationLabel: z.string().trim().max(240).nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  timezone: z.string().min(1).max(80),
  priority: z.number().int().min(1).max(5),
  flexibility: z.enum(["fixed", "protected", "flexible"]),
  earliestStart: z.string().nullable(),
  latestEnd: z.string().nullable(),
  normalDurationMinutes: z.number().int().positive().max(2400).nullable(),
  minimumDurationMinutes: z.number().int().positive().max(2400).nullable(),
  minimumChunkMinutes: z.number().int().positive().max(480).nullable(),
  canShorten: z.boolean(),
  canSplit: z.boolean(),
  canSkip: z.boolean(),
  reminderMinutes: z.number().int().min(0).max(10080),
  assumptions: z.array(z.string().max(240)).max(12),
});
export const confirmProposalSchema = z.object({
  proposalId: z.string().uuid(),
  items: z.array(proposalItemSchema).min(1).max(20),
  remember: z.boolean().default(false),
});
export type CommandHint = z.infer<typeof commandHintSchema>;
export type SchedulingAction = z.infer<typeof schedulingActionSchema>;
export type SchedulingIntent = z.infer<typeof schedulingIntentSchema>;
export type DeadlinePreparation = z.infer<typeof deadlinePreparationSchema>;
export type ProposalItem = z.infer<typeof proposalItemSchema>;
