"use client";
import { Capacitor } from "@capacitor/core";
import { LocalLLM } from "@capacitor/local-llm";
import { commandHintSchema, type CommandHint } from "@/lib/scheduling/schema";

const INSTRUCTIONS = `You extract scheduling details from one command. Reply with only a JSON object, no prose and no code fence.

Fields:
- kind: "event" for something at a fixed time, "task" for work with no fixed time, "deadline" for something due, "preparation" for work leading up to a deadline.
- title: a short name, 2-6 words, no dates or times in it.
- category: one word describing the type, such as Class, Work, Health, Personal, Errand.
- when: the time phrasing exactly as written, such as "tomorrow 3pm" or "friday at 9". Use null if none is given.
- duration_minutes: a whole number of minutes if a length is stated or clearly implied, otherwise null.`;

export function nativeLLMSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function nativeLLMStatus() {
  if (!nativeLLMSupported()) return "unsupported" as const;
  try {
    const { status } = await LocalLLM.systemAvailability();
    return status;
  } catch {
    return "unavailable" as const;
  }
}

// The model reliably wraps or pads JSON, so take the outermost braces rather
// than trusting the whole response to parse.
function extractJSON(text: string) {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export async function interpretOnDevice(
  command: string,
): Promise<CommandHint | null> {
  if ((await nativeLLMStatus()) !== "available") return null;
  try {
    const { text } = await LocalLLM.prompt({
      prompt: command,
      instructions: INSTRUCTIONS,
      options: { temperature: 0.1, maximumOutputTokens: 300 },
    });
    const parsed = extractJSON(text);
    if (!parsed) return null;
    const result = commandHintSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
