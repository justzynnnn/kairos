import { NextResponse } from "next/server";
import { startConversation } from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import { connectionRequestSchema } from "@/lib/profile/people-schema";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

// Accepting a friend request does not create a thread — the first person to
// open one does, through this. Without it the phone could only reply to
// conversations somebody started on the web.
export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-conversation-create"),
      20,
    ))
  )
    return tooManyRequests();
  const parsed = connectionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid friend." },
      { status: 400 },
    );
  try {
    await authenticateBearerRequest(request);
    return NextResponse.json(
      { conversationId: await startConversation(request, parsed.data.userId) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Conversation could not be started.") },
      { status: errorStatus(error, 403) },
    );
  }
}
