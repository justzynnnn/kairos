import { z } from "zod";
import {
  proposalItemSchema,
  schedulingIntentSchema,
  type SchedulingIntent,
} from "@/lib/scheduling/schema";
import type { CalendarItem, Preference, Viewer } from "@/lib/types";

export const nativeCapabilitiesSchema = z.object({
  foundationModel: z.object({
    state: z.enum(["available", "downloading", "unavailable", "unsupported"]),
    reason: z.string().nullable(),
  }),
  speech: z.object({
    state: z.enum(["ready", "prompt", "denied", "restricted", "unavailable"]),
    modern: z.boolean(),
    supportedLocales: z.array(z.string()),
    selectedLocale: z.string(),
  }),
});

export const transcriptEventSchema = z.object({
  sessionId: z.string().uuid(),
  sequence: z.number().int().positive(),
  text: z.string(),
  isFinal: z.boolean(),
});

const nativeActionSchema = z.object({
  kind: z.enum(["event", "task", "deadline", "preparation"]),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  locationLabel: z.string().max(240),
  startAt: z.string().max(80),
  endAt: z.string().max(80),
  dueAt: z.string().max(80),
  durationMinutes: z.number().int().min(0).max(720),
  totalEffortMinutes: z.number().int().min(0).max(2400),
  sessionLengthMinutes: z.number().int().min(0).max(480),
  blockCount: z.number().int().min(0).max(20),
  afterTitle: z.string().max(160),
  relatedDeadlineTitle: z.string().max(160),
  flexibility: z.enum(["fixed", "protected", "flexible"]),
  canShorten: z.boolean(),
  canSplit: z.boolean(),
  canSkip: z.boolean(),
  priority: z.number().int().min(1).max(5),
  reminderMinutes: z.number().int().min(0).max(10080),
  assumptions: z.array(z.string().max(240)).max(8),
});

export const nativePlannerResultSchema = z.object({
  kind: z.enum(["clarification", "proposal"]),
  summary: z.string().min(1).max(300),
  question: z.string().max(400),
  followUpKind: z.enum(["none", "clarify", "deadline_preparation"]),
  assumptions: z.array(z.string().max(240)).max(12),
  actions: z.array(nativeActionSchema).min(1).max(20),
  contextVersion: z.number().int().nonnegative(),
  provider: z.literal("apple-intelligence"),
});

export function plannerResultToIntent(
  value: z.infer<typeof nativePlannerResultSchema>,
): SchedulingIntent {
  return schedulingIntentSchema.parse({
    summary: value.summary,
    ambiguity: value.kind === "clarification",
    follow_up_kind: value.followUpKind,
    essential_question: value.question || null,
    assumptions: value.assumptions,
    external_send_authorized: false,
    actions: value.actions.map((action) => ({
      kind: action.kind,
      title: action.title,
      category: action.category,
      location_label: action.locationLabel || null,
      start_at: action.startAt || null,
      end_at: action.endAt || null,
      due_at: action.dueAt || null,
      duration_minutes: action.durationMinutes || null,
      total_effort_minutes: action.totalEffortMinutes || null,
      session_length_minutes: action.sessionLengthMinutes || null,
      block_count: action.blockCount || null,
      after_title: action.afterTitle || null,
      related_deadline_title: action.relatedDeadlineTitle || null,
      flexibility: action.flexibility,
      can_shorten: action.canShorten,
      can_split: action.canSplit,
      can_skip: action.canSkip,
      priority: action.priority,
      reminder_minutes: action.reminderMinutes,
      assumptions: action.assumptions,
    })),
  });
}

const operationBaseSchema = z.object({
  clientOperationId: z.string().uuid(),
  baseScheduleVersion: z.number().int().positive(),
  targetId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const mobileSchedulePayloadSchema = proposalItemSchema
  .omit({ clientId: true, assumptions: true })
  .partial({
    category: true,
    locationLabel: true,
    timezone: true,
    priority: true,
    flexibility: true,
    earliestStart: true,
    latestEnd: true,
    normalDurationMinutes: true,
    minimumDurationMinutes: true,
    minimumChunkMinutes: true,
    canShorten: true,
    canSplit: true,
    canSkip: true,
    reminderMinutes: true,
  })
  .superRefine((payload, context) => {
    if (payload.type === "deadline") {
      if (!payload.dueAt)
        context.addIssue({
          code: "custom",
          path: ["dueAt"],
          message: "A deadline requires a due time.",
        });
      return;
    }
    if (!payload.startAt || !payload.endAt) {
      context.addIssue({
        code: "custom",
        path: ["startAt"],
        message: "A scheduled item requires a start and end.",
      });
      return;
    }
    if (new Date(payload.endAt) <= new Date(payload.startAt))
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "The end must follow the start.",
      });
  });

const createOperationSchema = operationBaseSchema.extend({
  kind: z.literal("create"),
  targetVersion: z.null(),
  payload: mobileSchedulePayloadSchema,
});
const editOperationSchema = operationBaseSchema.extend({
  kind: z.literal("edit"),
  targetVersion: z.number().int().positive(),
  payload: mobileSchedulePayloadSchema,
});
const completeOperationSchema = operationBaseSchema.extend({
  kind: z.literal("complete"),
  targetVersion: z.number().int().positive(),
  payload: z.object({}).strict(),
});
const cancelOperationSchema = operationBaseSchema.extend({
  kind: z.literal("cancel"),
  targetVersion: z.number().int().positive(),
  payload: z.object({}).strict(),
});

export const scheduleOperationSchema = z.discriminatedUnion("kind", [
  createOperationSchema,
  editOperationSchema,
  completeOperationSchema,
  cancelOperationSchema,
]);

export const mobileSyncRequestSchema = z.object({
  operations: z.array(scheduleOperationSchema).min(1).max(50),
});

export const syncConflictSchema = z.object({
  operationId: z.string().uuid(),
  code: z.enum([
    "schedule_changed",
    "item_changed",
    "item_deleted",
    "overlap",
    "invalid",
  ]),
  message: z.string(),
});

export type NativeCapabilities = z.infer<typeof nativeCapabilitiesSchema>;
export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;
export type NativePlannerResult = z.infer<typeof nativePlannerResultSchema>;
export type ScheduleOperation = z.infer<typeof scheduleOperationSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;

export type MobileBootstrap = {
  viewer: Viewer;
  calendar: CalendarItem[];
  preferences: Preference[];
  scheduleVersion: number;
  cursor: string;
  conversationSummaries: Array<{
    id: string;
    name: string;
    lastMessage: string | null;
    updatedAt: string;
    unreadCount: number;
  }>;
  meetingSummaries: Array<{
    id: string;
    title: string;
    state: string;
    updatedAt: string;
  }>;
};

export type MobileSyncResult = {
  appliedOperationIds: string[];
  scheduleVersion: number;
  calendar: CalendarItem[];
  conflicts: SyncConflict[];
};
