import { NextResponse } from "next/server";
import { removePreference, savePreference } from "@/lib/profile/server";
import { preferenceSchema as schema } from "@/lib/profile/settings-schema";
import { userMessage } from "@/lib/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Preference is invalid." },
      { status: 400 },
    );
  try {
    const { id } = await params;
    return NextResponse.json({
      preference: await savePreference(id, parsed.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preference could not be saved.") },
      { status: 422 },
    );
  }
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await removePreference(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Preference could not be deleted.") },
      { status: 422 },
    );
  }
}
