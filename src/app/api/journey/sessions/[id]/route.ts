import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { stopHostedJourneySession } from "@/lib/journey/session-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
const schema = z.object({
  status: z.enum(["stopped", "arrived", "expired"]).default("stopped"),
});
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Journey status is invalid." },
      { status: 400 },
    );
  try {
    const { id } = await params;
    if (isSupabaseConfigured())
      await stopHostedJourneySession(
        await createServerSupabaseClient(),
        id,
        parsed.data.status,
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Journey could not be stopped.") },
      { status: 422 },
    );
  }
}
