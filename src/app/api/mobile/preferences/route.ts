import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { createPreference, getEditablePreferences } from "@/lib/profile/server";
import { preferenceSchema } from "@/lib/profile/settings-schema";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({ preferences: await getEditablePreferences() });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preferences could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  const parsed = preferenceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Preference is invalid." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({
      preference: await createPreference(parsed.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preference could not be created.") },
      { status: errorStatus(error, 422) },
    );
  }
}
