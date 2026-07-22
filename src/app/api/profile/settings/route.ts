import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileSettings, saveProfileSettings } from "@/lib/profile/server";
import { errorStatus, userMessage } from "@/lib/http";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/, {
        message: "Username must be 3–32 letters, numbers, or underscores.",
      }),
    timezone: z.string().trim().min(3).max(80),
    activeStart: time,
    activeEnd: time,
    travelBufferMinutes: z.number().int().min(0).max(120),
    locationEnabled: z.boolean(),
    automationReminders: z.boolean(),
    automationLateness: z.boolean(),
    activityAggregateSharing: z.boolean(),
    scheduleVisibility: z.enum(["public", "friends", "private"]),
  })
  .refine((value) => value.activeStart < value.activeEnd, {
    message: "Active hours must end after they start.",
  });

export async function GET() {
  try {
    return NextResponse.json({ settings: await getProfileSettings() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Settings could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Settings are invalid." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      settings: await saveProfileSettings(parsed.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Settings could not be saved.") },
      { status: errorStatus(error, 422) },
    );
  }
}
