import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { dismissPreviewRepairIncident } from "@/lib/repair/incident-preview-store";
import { dismissHostedRepairIncident } from "@/lib/repair/incidents-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dismissed = isSupabaseConfigured()
      ? await dismissHostedRepairIncident(
          await createServerSupabaseClient(),
          id,
        )
      : dismissPreviewRepairIncident(id);
    return NextResponse.json({ success: true, dismissed });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "This repair could not be dismissed.") },
      { status: 422 },
    );
  }
}
