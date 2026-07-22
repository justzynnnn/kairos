import { NextResponse } from "next/server";
import { mapCalendarRow } from "@/lib/demo-data";
import { errorStatus, userMessage } from "@/lib/http";
import {
  interpretWithGemini,
  isGeminiConfigured,
} from "@/lib/scheduling/gemini";
import { cloudInterpretRequestSchema } from "@/lib/scheduling/schema";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authenticateBearerRequest } from "@/lib/supabase/request";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-ai-cloud"),
      20,
    ))
  )
    return tooManyRequests();
  try {
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
    const { user } = await authenticateBearerRequest(request);
    const admin = createAdminSupabaseClient();
    const start = new Date(Date.now() - 86_400_000).toISOString();
    const end = new Date(Date.now() + 31 * 86_400_000).toISOString();
    const [profileResult, calendarResult, preferenceResult] = await Promise.all(
      [
        admin
          .from("profiles")
          .select(
            "id,email,full_name,username,timezone,active_start,active_end,travel_buffer_minutes,avatar_url,schedule_version",
          )
          .eq("id", user.id)
          .single(),
        admin
          .from("calendar_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "scheduled")
          .or(
            `and(start_at.lt.${end},end_at.gt.${start}),and(item_type.eq.deadline,due_at.gte.${start},due_at.lte.${end})`,
          )
          .limit(500),
        admin
          .from("preferences")
          .select(
            "id,category,default_duration_minutes,flexibility,can_shorten,can_split,can_skip",
          )
          .eq("user_id", user.id),
      ],
    );
    if (profileResult.error || calendarResult.error || preferenceResult.error)
      throw new Error("Unable to build private fallback context.");
    const profile = profileResult.data;
    const intent = await interpretWithGemini({
      command: body.data.command,
      clarification: body.data.clarification,
      deadlinePreparation: body.data.deadlinePreparation,
      viewer: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        username: profile.username,
        timezone: profile.timezone,
        activeStart: profile.active_start,
        activeEnd: profile.active_end,
        travelBufferMinutes: profile.travel_buffer_minutes,
        avatarUrl: profile.avatar_url,
        preview: false,
        scheduleVersion: profile.schedule_version,
      },
      calendar: (calendarResult.data ?? []).map((row) => mapCalendarRow(row)),
      preferences: (preferenceResult.data ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        defaultDurationMinutes: row.default_duration_minutes,
        flexibility: row.flexibility,
        canShorten: row.can_shorten,
        canSplit: row.can_split,
        canSkip: row.can_skip,
      })),
    });
    return NextResponse.json({ intent, provider: "gemini" });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Cloud interpretation failed.") },
      { status: errorStatus(error, 422) },
    );
  }
}
