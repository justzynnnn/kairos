import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/server-env";
import {
  schedulingIntentSchema,
  type DeadlinePreparation,
  type SchedulingIntent,
} from "@/lib/scheduling/schema";
import type { CalendarItem, Preference, Viewer } from "@/lib/types";

function compactSchedule(items: CalendarItem[]) {
  return items.slice(0, 80).map((item) => ({
    title: item.title,
    type: item.type,
    start_at: item.startAt,
    end_at: item.endAt,
    due_at: item.dueAt,
    location: item.locationLabel,
    flexibility: item.flexibility,
  }));
}

function compactPreferences(preferences: Preference[]) {
  return preferences.map((preference) => ({
    category: preference.category,
    default_duration_minutes: preference.defaultDurationMinutes,
    flexibility: preference.flexibility,
    can_shorten: preference.canShorten,
    can_split: preference.canSplit,
    can_skip: preference.canSkip,
  }));
}

export function isOpenAIConfigured() {
  return Boolean(getServerEnv().OPENAI_API_KEY);
}

export async function interpretWithOpenAI({
  command,
  clarification,
  deadlinePreparation,
  viewer,
  calendar,
  preferences,
  now = new Date(),
}: {
  command: string;
  clarification?: string;
  deadlinePreparation?: DeadlinePreparation;
  viewer: Viewer;
  calendar: CalendarItem[];
  preferences: Preference[];
  now?: Date;
}): Promise<SchedulingIntent> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 20_000,
  });
  const schema = z.toJSONSchema(schedulingIntentSchema, { target: "draft-7" });
  const context = JSON.stringify({
    current_time: now.toISOString(),
    timezone: viewer.timezone,
    active_hours: { start: viewer.activeStart, end: viewer.activeEnd },
    schedule: compactSchedule(calendar),
    explicit_preferences: compactPreferences(preferences),
    clarification: clarification ?? null,
    deadline_preparation: deadlinePreparation ?? null,
  });

  const instructions = `You interpret scheduling commands for Kairos. Return only the requested structured object.

Rules:
- Never claim to write calendar data and never authorize an external send.
- Resolve relative dates using current_time and timezone. Every timestamp must be an ISO 8601 instant with an offset.
- Fixed events and deadlines are fixed. Ordinary tasks are flexible. Preparation is flexible, movable, and splittable, but cannot be shortened or skipped unless explicitly authorized.
- Preserve every part of compound commands as a separate action.
- Extract a spoken destination into location_label. Never invent a precise address.
- Use safe, visible assumptions only for nonessential details such as a 10-minute reminder.
- If a missing detail prevents valid placement, set ambiguity true and ask exactly one essential question.
- When a deadline is created without preparation details, use follow_up_kind deadline_preparation and ask for one/multiple blocks, total effort, and preferred session length.
- If deadline_preparation is present, create the deadline plus preparation actions. block_count must cover total_effort_minutes.
- Do not move existing calendar items. Avoid proposing an explicit time that overlaps the supplied schedule.
- external_send_authorized must always be false.

Context: ${context}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: env.OPENAI_SCHEDULING_MODEL,
        instructions,
        input: command,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "kairos_scheduling_intent",
            strict: true,
            schema,
          },
        },
      });
      const parsed = schedulingIntentSchema.safeParse(
        JSON.parse(response.output_text),
      );
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("The AI response could not be validated.", {
    cause: lastError,
  });
}

export async function transcribeAudio(file: File) {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 1,
    timeout: 30_000,
  });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: env.OPENAI_TRANSCRIPTION_MODEL,
    response_format: "json",
  });
  return transcription.text.trim();
}
