import { NextResponse } from "next/server";
import { getViewer } from "@/lib/data";
import {
  getDemoCalendarItems,
  getDemoScheduleVersion,
  replaceDemoCalendarItems,
} from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/env";
import { validateRepairAlternative } from "@/lib/repair/engine";
import {
  getPreviewRepair,
  removePreviewRepair,
} from "@/lib/repair/preview-store";
import { confirmRepairSchema } from "@/lib/repair/schema";
import type { RepairAlternative } from "@/lib/repair/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordPrivateScheduleActivity } from "@/lib/conversations/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const parsed = confirmRepairSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "This repair approval is invalid." },
      { status: 400 },
    );
  const viewer = await getViewer();
  if (!isSupabaseConfigured()) {
    const proposal = getPreviewRepair(parsed.data.proposalId);
    if (
      !proposal ||
      proposal.baseScheduleVersion !== parsed.data.baseScheduleVersion ||
      getDemoScheduleVersion() !== proposal.baseScheduleVersion
    )
      return NextResponse.json(
        {
          error:
            "Your schedule changed. Generate a fresh repair before confirming.",
        },
        { status: 409 },
      );
    const alternative = proposal.alternatives.find(
      (entry: RepairAlternative) => entry.id === parsed.data.alternativeId,
    );
    if (!alternative)
      return NextResponse.json(
        { error: "That repair alternative is no longer available." },
        { status: 404 },
      );
    try {
      validateRepairAlternative(getDemoCalendarItems(), alternative);
    } catch {
      return NextResponse.json(
        { error: "This repair no longer satisfies your schedule constraints." },
        { status: 409 },
      );
    }
    if (
      !replaceDemoCalendarItems(
        alternative.resultingItems,
        proposal.baseScheduleVersion,
      )
    )
      return NextResponse.json(
        {
          error:
            "Your schedule changed. Generate a fresh repair before confirming.",
        },
        { status: 409 },
      );
    removePreviewRepair(parsed.data.proposalId);
    await recordPrivateScheduleActivity(
      viewer.id,
      "Schedule repair approved. Your private planner was updated atomically.",
      `repair:${parsed.data.proposalId}:approved`,
      parsed.data.proposalId,
    );
    return NextResponse.json({
      success: true,
      preview: true,
      message:
        "Repair approved atomically. Your preview schedule has been updated.",
      scheduleVersion: proposal.baseScheduleVersion + 1,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_repair_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_alternative_id: parsed.data.alternativeId,
  });
  if (error) {
    const stale = /changed|stale|serial|version/i.test(error.message);
    return NextResponse.json(
      {
        error: stale
          ? "Your schedule changed. Generate a fresh repair before confirming."
          : "Kairos could not apply this repair safely.",
      },
      { status: stale ? 409 : 422 },
    );
  }
  await recordPrivateScheduleActivity(
    viewer.id,
    "Schedule repair approved. Your private planner was updated atomically.",
    `repair:${parsed.data.proposalId}:approved`,
    parsed.data.proposalId,
  );
  return NextResponse.json({
    success: true,
    preview: false,
    message: "Repair approved and calendar updated.",
    result: data,
  });
}
