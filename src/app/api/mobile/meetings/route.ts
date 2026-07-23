import { NextResponse } from "next/server";
import { errorStatus, userMessage } from "@/lib/http";
import { listMeetings } from "@/lib/meetings/server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json({ meetings: await listMeetings(request) });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Meetings could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}
