import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import {
  actOnPreviewBooking,
  getPreviewBooking,
} from "@/lib/meetings/preview-store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
const responseSchema = z.object({
  action: z.enum(["accept", "counter", "decline"]),
  optionId: z.string().uuid().optional(),
  counterStart: z.iso.datetime({ offset: true }).optional(),
});
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
async function realBooking(token: string) {
  const admin = createAdminSupabaseClient();
  const { data: key } = await admin
    .from("external_booking_tokens")
    .select("meeting_id,expires_at,revoked_at")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (!key || key.revoked_at || new Date(key.expires_at) <= new Date())
    return null;
  const [{ data: meeting }, { data: options }, { data: organizer }] =
    await Promise.all([
      admin
        .from("meeting_requests")
        .select(
          "id,title,state,duration_minutes,timezone,selected_option_id,created_by",
        )
        .eq("id", key.meeting_id)
        .single(),
      admin
        .from("meeting_options")
        .select("id,start_at,end_at,label,reason,source")
        .eq("meeting_id", key.meeting_id)
        .order("start_at"),
      admin
        .from("meeting_participants")
        .select("name")
        .eq("meeting_id", key.meeting_id)
        .eq("role", "organizer")
        .single(),
    ]);
  if (!meeting) return null;
  return {
    id: meeting.id,
    title: meeting.title,
    state: meeting.state,
    durationMinutes: meeting.duration_minutes,
    timezone: meeting.timezone,
    selectedOptionId: meeting.selected_option_id,
    organizer: organizer?.name ?? "Organizer",
    options: (options ?? []).map((option) => ({
      id: option.id,
      startAt: option.start_at,
      endAt: option.end_at,
      label: option.label,
      reason: option.reason,
      source: option.source,
    })),
  };
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "booking-get"),
      60,
    ))
  )
    return tooManyRequests();
  const { token } = await params;
  const booking = isSupabaseConfigured()
    ? await realBooking(token)
    : getPreviewBooking(token);
  return booking
    ? NextResponse.json({ booking })
    : NextResponse.json(
        { error: "This booking link is invalid, expired, or revoked." },
        { status: 404 },
      );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "booking-post"),
      15,
    ))
  )
    return tooManyRequests();
  const body = responseSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "This booking response is invalid." },
      { status: 400 },
    );
  const { token } = await params;
  try {
    if (!isSupabaseConfigured())
      return NextResponse.json({
        booking: actOnPreviewBooking(token, body.data.action, body.data),
      });
    const admin = createAdminSupabaseClient();
    const { error } = await admin.rpc("respond_to_external_booking", {
      p_token_hash: hash(token),
      p_action: body.data.action,
      p_option_id: body.data.optionId ?? null,
      p_counter_start: body.data.counterStart ?? null,
    });
    if (error) throw new Error("This booking response is stale or invalid.");
    return NextResponse.json({ booking: await realBooking(token) });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "This booking response failed.") },
      { status: 409 },
    );
  }
}
