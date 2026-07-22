import { NextResponse } from "next/server";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import { localDay, wakeRepairRequest } from "@/lib/repair/incident-math";
import {
  applyPreviewAutomaticRepair,
  latestPreviewIncident,
  recordPreviewDayStart,
} from "@/lib/repair/incident-preview-store";
import {
  applyHostedAutomaticRepair,
  latestHostedIncident,
  recordHostedDayStart,
} from "@/lib/repair/incidents-server";
import type { DayStartResult } from "@/lib/repair/incidents-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST() {
  try {
    const now = new Date(),
      [viewer, items] = await Promise.all([getViewer(), getCalendarItems()]),
      day = localDay(now, viewer.timezone);
    const supabase = isSupabaseConfigured()
      ? await createServerSupabaseClient()
      : null;
    const firstOpen = supabase
      ? await recordHostedDayStart(supabase, day, now.toISOString())
      : recordPreviewDayStart(day);
    if (!firstOpen) {
      const incident = supabase
        ? await latestHostedIncident(supabase, { day }, viewer.scheduleVersion)
        : latestPreviewIncident({ localDate: day });
      const result: DayStartResult = {
        dayStarted: true,
        firstOpen: false,
        broken: Boolean(incident && incident.status !== "undone"),
        incident,
      };
      return NextResponse.json(result);
    }
    const request = wakeRepairRequest(items, now, viewer.timezone);
    if (!request) {
      const result: DayStartResult = {
        dayStarted: true,
        firstOpen: true,
        broken: false,
        incident: null,
      };
      return NextResponse.json(result);
    }
    request.travelBufferMinutes = viewer.travelBufferMinutes;
    const reason = `Your day started ${request.delayMinutes} minutes after an adjustable task began. Kairos changed only operations that task permissions allow.`;
    const sourceKey = `wake:${day}`,
      incident = supabase
        ? await applyHostedAutomaticRepair(
            supabase,
            viewer.id,
            viewer.scheduleVersion,
            items,
            request,
            reason,
            sourceKey,
            day,
          )
        : applyPreviewAutomaticRepair(request, reason, sourceKey, day);
    const result: DayStartResult = {
      dayStarted: true,
      firstOpen: true,
      broken: Boolean(incident),
      incident,
    };
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: userMessage(
          error,
          "Kairos could not check the start of your day.",
        ),
      },
      { status: 500 },
    );
  }
}
