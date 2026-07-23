import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { removePreference, savePreference } from "@/lib/profile/server";
import { preferenceSchema } from "@/lib/profile/settings-schema";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    return NextResponse.json({
      preference: await savePreference(id, parsed.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preference could not be saved.") },
      { status: errorStatus(error, 422) },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    await removePreference(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preference could not be deleted.") },
      { status: errorStatus(error, 422) },
    );
  }
}
