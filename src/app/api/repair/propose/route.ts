import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { buildRepairSolution } from "@/lib/repair/engine";
import { repairRequestSchema } from "@/lib/repair/schema";
import { savePreviewRepair } from "@/lib/repair/preview-store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const parsed = repairRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Choose a valid repair trigger and delay between 15 minutes and 6 hours.",
      },
      { status: 400 },
    );
  const [viewer, calendar] = await Promise.all([
    getViewer(),
    getCalendarItems(),
  ]);
  const solution = buildRepairSolution(calendar, {
    ...parsed.data,
    activeStart: viewer.activeStart,
    activeEnd: viewer.activeEnd,
    travelBufferMinutes: viewer.travelBufferMinutes,
    allowProtected: true,
  });
  if (solution.status === "impossible")
    return NextResponse.json(solution, { status: 422 });
  let proposalId = randomUUID();
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("schedule_proposals")
      .insert({
        user_id: viewer.id,
        proposal_type: "repair",
        status: "draft",
        base_schedule_version: viewer.scheduleVersion,
        payload: {
          trigger: parsed.data.trigger,
          delay_minutes: parsed.data.delayMinutes,
          revision: parsed.data.revision ?? null,
          alternatives: solution.alternatives,
        },
      })
      .select("id")
      .single();
    if (error)
      return NextResponse.json(
        { error: "Kairos could not safely save this repair proposal." },
        { status: 500 },
      );
    proposalId = data.id;
  } else
    savePreviewRepair(proposalId, {
      baseScheduleVersion: viewer.scheduleVersion,
      alternatives: solution.alternatives,
      createdAt: Date.now(),
    });
  return NextResponse.json({
    status: "proposal",
    proposalId,
    baseScheduleVersion: viewer.scheduleVersion,
    alternatives: solution.alternatives.map((alternative) => ({
      id: alternative.id,
      label: alternative.label,
      recommended: alternative.recommended,
      explanation: alternative.explanation,
      operations: alternative.operations,
      score: alternative.score,
    })),
    preview: viewer.preview,
  });
}
