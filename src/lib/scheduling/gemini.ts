import "server-only";

import { z } from "zod";
import { getServerEnv } from "@/lib/server-env";
import {
  sanitizeCloudContext,
  type CloudContext,
} from "@/lib/scheduling/cloud-privacy";
import {
  schedulingIntentSchema,
  type SchedulingIntent,
} from "@/lib/scheduling/schema";

export function isGeminiConfigured() {
  return Boolean(getServerEnv().GEMINI_API_KEY);
}

function responseText(value: unknown) {
  const result = z
    .object({
      candidates: z
        .array(
          z.object({
            content: z.object({
              parts: z.array(z.object({ text: z.string() })),
            }),
          }),
        )
        .min(1),
    })
    .safeParse(value);
  if (!result.success) return null;
  return result.data.candidates[0].content.parts
    .map((part) => part.text)
    .join("");
}

export async function interpretWithGemini(
  context: CloudContext,
): Promise<SchedulingIntent> {
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY) throw new Error("Gemini is not configured.");

  const jsonSchema = z.toJSONSchema(schedulingIntentSchema, {
    target: "draft-7",
  });
  const safeContext = sanitizeCloudContext(context);
  const instructions = [
    "You are Kairos, a scheduling interpreter. Produce only the requested structured scheduling intent.",
    "Never claim to modify a calendar. Never authorize an external send. Resolve relative dates from current_time and timezone. Fixed events and deadlines are fixed; ordinary tasks are flexible. Keep every part of a compound command as a separate action. Ask exactly one essential question when placement is unsafe or underspecified. Never invent a location or move an existing item. Avoid supplied busy intervals. external_send_authorized must be false.",
    "Privacy-filtered context:",
    JSON.stringify(safeContext),
  ].join("\n\n");
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(env.GEMINI_FALLBACK_MODEL) +
    ":generateContent";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: context.command }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Gemini request failed.");
  const text = responseText(await response.json());
  if (!text) throw new Error("Gemini returned no structured result.");
  const parsed = schedulingIntentSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error("Gemini returned an invalid scheduling result.");
  return parsed.data;
}
