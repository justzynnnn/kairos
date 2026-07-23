import { NextResponse } from "next/server";
import { getProfileSettings, saveProfileSettings } from "@/lib/profile/server";
import { profileSettingsSchema } from "@/lib/profile/settings-schema";
import { errorStatus, userMessage } from "@/lib/http";

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
  const parsed = profileSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
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
