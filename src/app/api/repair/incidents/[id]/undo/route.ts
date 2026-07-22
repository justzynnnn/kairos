import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { undoPreviewAutomaticRepair } from "@/lib/repair/incident-preview-store";
import { undoHostedAutomaticRepair } from "@/lib/repair/incidents-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = isSupabaseConfigured()
      ? await undoHostedAutomaticRepair(await createServerSupabaseClient(), id)
      : undoPreviewAutomaticRepair(id);
    return NextResponse.json({ success: true, incident: result });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "This repair could not be undone.") },
      { status: 409 },
    );
  }
}
