import { NextResponse } from "next/server";
import { recordMeetingActivity } from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import { meetingRespondSchema } from "@/lib/meetings/respond-schema";
import { actOnMeeting } from "@/lib/meetings/server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = meetingRespondSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success)
    return NextResponse.json(
      { error: "This meeting response is invalid." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    const meeting = await actOnMeeting(
      id,
      body.data.action,
      body.data,
      request,
    );
    await recordMeetingActivity(meeting, body.data.action);
    return NextResponse.json({ meeting });
  } catch (error) {
    return NextResponse.json(
      {
        error: userMessage(error, "That meeting response is no longer valid."),
      },
      { status: errorStatus(error, 409) },
    );
  }
}
