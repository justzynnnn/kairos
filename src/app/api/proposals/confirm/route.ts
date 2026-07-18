import { NextResponse } from "next/server";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { validateProposalItems, SchedulingValidationError } from "@/lib/scheduling/engine";
import { confirmProposalSchema, type ProposalItem } from "@/lib/scheduling/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDemoScheduleVersion,replaceDemoCalendarItems } from "@/lib/demo-data";
import type { CalendarItem } from "@/lib/types";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

function databaseItem(item: ProposalItem) {
  return {
    type: item.type,
    title: item.title,
    category: item.category,
    location_label: item.locationLabel,
    start_at: item.startAt,
    end_at: item.endAt,
    due_at: item.dueAt,
    timezone: item.timezone,
    priority: item.priority,
    flexibility: item.flexibility,
    earliest_start: item.earliestStart,
    latest_end: item.latestEnd,
    normal_duration_minutes: item.normalDurationMinutes,
    minimum_duration_minutes: item.minimumDurationMinutes,
    minimum_chunk_minutes: item.minimumChunkMinutes,
    can_shorten: item.canShorten,
    can_split: item.canSplit,
    can_skip: item.canSkip,
    reminder_minutes: item.reminderMinutes,
  };
}

function explicitPreferences(items: ProposalItem[]) {
  const categories = new Map<string, ProposalItem>();
  items.forEach((item) => categories.set(item.category, item));
  return [...categories.values()].map((item) => ({
    category: item.category,
    default_duration_minutes: item.normalDurationMinutes,
    flexibility: item.flexibility,
    can_shorten: item.canShorten,
    can_split: item.canSplit,
    can_skip: item.canSkip,
  }));
}

export async function POST(request: Request) {
  const parsed = confirmProposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The edited proposal is invalid." }, { status: 400 });
  const [viewer, calendar] = await Promise.all([getViewer(), getCalendarItems()]);
  try {
    validateProposalItems(parsed.data.items, calendar);
  } catch (error) {
    const message = error instanceof SchedulingValidationError ? error.message : "The proposal no longer fits your calendar.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (!isSupabaseConfigured()) {
    const nextItems:CalendarItem[]=parsed.data.items.map((item)=>({id:randomUUID(),userId:viewer.id,type:item.type,title:item.title,description:null,startAt:item.startAt,endAt:item.endAt,dueAt:item.dueAt,timezone:item.timezone,priority:item.priority,flexibility:item.flexibility,earliestStart:item.earliestStart,latestEnd:item.latestEnd,normalDurationMinutes:item.normalDurationMinutes,minimumDurationMinutes:item.minimumDurationMinutes,minimumChunkMinutes:item.minimumChunkMinutes,canShorten:item.canShorten,canSplit:item.canSplit,canSkip:item.canSkip,locationLabel:item.locationLabel,destinationLatitude:null,destinationLongitude:null,destinationPlaceId:null,destinationResolvedAt:null,relatedDeadlineId:null,dependencyIds:[],category:item.category,reminderMinutes:item.reminderMinutes,status:"scheduled",version:1}));
    if(!replaceDemoCalendarItems([...calendar,...nextItems],getDemoScheduleVersion()))return NextResponse.json({error:"Your schedule changed. Generate a fresh proposal before confirming."},{status:409});
    return NextResponse.json({
      success: true,
      preview: true,
      message: "Schedule confirmed for this demo session.",
      items: nextItems,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_schedule_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_items: parsed.data.items.map(databaseItem),
    p_preferences: parsed.data.remember ? explicitPreferences(parsed.data.items) : [],
  });
  if (error) {
    const stale = /changed|stale|serial/i.test(error.message);
    return NextResponse.json({ error: stale ? "Your schedule changed. Generate a fresh proposal before confirming." : "Kairos could not confirm this proposal safely." }, { status: stale ? 409 : 422 });
  }
  return NextResponse.json({ success: true, preview: false, message: "Schedule confirmed.", result: data, viewerId: viewer.id });
}
