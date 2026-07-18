import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCalendarItems, getPreferences, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildScheduleProposal, SchedulingValidationError } from "@/lib/scheduling/engine";
import { deterministicInterpret } from "@/lib/scheduling/fallback";
import { interpretWithOpenAI, isOpenAIConfigured } from "@/lib/scheduling/openai";
import { interpretRequestSchema } from "@/lib/scheduling/schema";
import { reserveAIUsage } from "@/lib/scheduling/usage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = interpretRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter a scheduling command under 2,000 characters." }, { status: 400 });

  const [viewer, calendar, preferences] = await Promise.all([getViewer(), getCalendarItems(), getPreferences()]);
  let provider: "openai" | "deterministic" = "deterministic";
  let providerNotice: string | null = null;
  let intent = null;

  if (isOpenAIConfigured()) {
    const allowed = await reserveAIUsage(viewer, "text", 1);
    if (!allowed) return NextResponse.json({ error: "Your daily AI request limit has been reached. Try again tomorrow." }, { status: 429 });
    try {
      intent = await interpretWithOpenAI({
        command: body.data.command,
        clarification: body.data.clarification,
        deadlinePreparation: body.data.deadlinePreparation,
        viewer,
        calendar,
        preferences,
      });
      provider = "openai";
    } catch {
      providerNotice = "OpenAI was unavailable or returned an invalid result. Kairos used the limited deterministic fallback.";
    }
  } else {
    providerNotice = "OpenAI is not configured. Kairos used the limited deterministic fallback.";
  }

  intent ??= deterministicInterpret(
    `${body.data.command}${body.data.clarification ? `; clarification: ${body.data.clarification}` : ""}`,
    new Date(),
    body.data.deadlinePreparation,
  );
  if (!intent) {
    return NextResponse.json({
      status: "needs_input",
      followUpKind: "clarify",
      question: "I can safely handle the approved class, gym, deadline, and preparation demo patterns in fallback mode. What exact item, day, start time, and duration should I use?",
      provider,
      providerNotice,
    });
  }

  if (intent.ambiguity) {
    return NextResponse.json({
      status: "needs_input",
      followUpKind: intent.follow_up_kind,
      question: intent.essential_question,
      assumptions: intent.assumptions,
      provider,
      providerNotice,
    });
  }

  try {
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
          payload: { items, assumptions: intent.assumptions, provider },
        })
        .select("id")
        .single();
      if (error) throw new Error("Unable to save the proposal.");
      proposalId = data.id;
    }

    return NextResponse.json({
      status: "proposal",
      proposalId,
      summary: intent.summary,
      assumptions: [...intent.assumptions, ...items.flatMap((item) => item.assumptions)],
      items,
      provider,
      providerNotice,
      preview: viewer.preview,
    });
  } catch (error) {
    const message = error instanceof SchedulingValidationError ? error.message : "Kairos could not build a safe proposal.";
    return NextResponse.json({ status: "needs_input", followUpKind: "clarify", question: message, provider, providerNotice });
  }
}

