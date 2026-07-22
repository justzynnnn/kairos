import { NextResponse } from "next/server";
import { z } from "zod";
import { sendConversationMessage } from "@/lib/conversations/server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
export const runtime = "nodejs";
const schema = z.object({
  body: z.string().trim().min(1).max(4000),
  clientNonce: z.string().uuid(),
  relatedMeetingId: z.string().uuid().nullable().optional(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await allowPersistentRequest(clientKey(request.headers, "messages"), 60))
  )
    return tooManyRequests();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a message under 4,000 characters." },
      { status: 400 },
    );
  try {
    const { id } = await params;
    return NextResponse.json({
      id: await sendConversationMessage(
        request,
        id,
        parsed.data.body,
        parsed.data.clientNonce,
        parsed.data.relatedMeetingId ?? null,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Message could not be sent.") },
      { status: 403 },
    );
  }
}
