import { NextResponse } from "next/server";
import { z } from "zod";
import { removePreference, savePreference } from "@/lib/profile/server";
import { userMessage } from "@/lib/http";
const schema = z.object({
  category: z.string().trim().min(1).max(60),
  defaultDurationMinutes: z.number().int().min(15).max(1440).nullable(),
  flexibility: z.enum(["fixed", "protected", "flexible"]).nullable(),
  canShorten: z.boolean(),
  canSplit: z.boolean(),
  canSkip: z.boolean(),
});
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
