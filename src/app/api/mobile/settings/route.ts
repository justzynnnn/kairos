import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { getProfileSettings, saveProfileSettings } from "@/lib/profile/server";
import { profileSettingsSchema } from "@/lib/profile/settings-schema";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

// Both handlers are thin: the bearer token is verified here, and the same
// engine the web route calls does the work. The Authorization header on this
// request is what makes createServerSupabaseClient() inside those engines scope
// to this phone's user.
export async function GET(request: Request) {
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({ settings: await getProfileSettings() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Settings could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}

export async function PUT(request: Request) {
  const parsed = profileSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Settings are invalid." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
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
