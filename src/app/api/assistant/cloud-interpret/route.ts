import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCalendarItems, getPreferences, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  interpretWithGemini,
  isGeminiConfigured,
} from "@/lib/scheduling/gemini";
import {
  buildScheduleProposal,
  SchedulingValidationError,
} from "@/lib/scheduling/engine";
import { cloudInterpretRequestSchema } from "@/lib/scheduling/schema";
import { reserveAIUsage } from "@/lib/scheduling/usage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(clientKey(request.headers, "ai-cloud"), 20))
  )
    return tooManyRequests();
  const body = cloudInterpretRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success)
    return NextResponse.json(
      { error: "Cloud interpretation requires explicit consent." },
      { status: 400 },
    );
  if (!isGeminiConfigured())
    return NextResponse.json(
      { error: "Cloud fallback is not configured." },
      { status: 503 },
    );

  const [viewer, calendar, preferences] = await Promise.all([
    getViewer(),
    getCalendarItems(),
    getPreferences(),
  ]);
  if (!(await reserveAIUsage(viewer, 1)))
    return NextResponse.json(
      { error: "Your daily cloud request limit has been reached." },
      { status: 429 },
    );

  try {
    const intent = await interpretWithGemini({
      command: body.data.command,
      clarification: body.data.clarification,
      deadlinePreparation: body.data.deadlinePreparation,
      viewer,
      calendar,
      preferences,
    });
    if (intent.ambiguity)
      return NextResponse.json({
        status: "needs_input",
        followUpKind: intent.follow_up_kind,
        question: intent.essential_question,
        assumptions: intent.assumptions,
        provider: "gemini",
        providerNotice: "Gemini interpreted the privacy-filtered request.",
      });

    const items = buildScheduleProposal(intent, calendar, preferences);
    let proposalId = randomUUID();
    if (isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("schedule_proposals")
        .insert({
          user_id: viewer.id,
          proposal_type: "creation",
          status: "draft",
          base_schedule_version: viewer.scheduleVersion,
          payload: {
            items,
            assumptions: intent.assumptions,
            provider: "gemini",
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      proposalId = data.id;
    }
    return NextResponse.json({
      status: "proposal",
      proposalId,
      summary: intent.summary,
      assumptions: [
        ...intent.assumptions,
        ...items.flatMap((item) => item.assumptions),
      ],
      items,
      provider: "gemini",
      providerNotice:
        "Gemini received only this command and privacy-filtered scheduling context.",
      preview: viewer.preview,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SchedulingValidationError
            ? error.message
            : "Cloud interpretation is temporarily unavailable.",
      },
      { status: 422 },
    );
  }
}
