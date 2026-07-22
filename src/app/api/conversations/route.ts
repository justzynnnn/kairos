import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getConversationContacts,
  startConversation,
} from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({ userId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      contacts: await getConversationContacts(request),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Conversations could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "conversation-create"),
      20,
    ))
  )
    return tooManyRequests();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid friend." },
      { status: 400 },
    );

  try {
    const conversationId = await startConversation(request, parsed.data.userId);
    return NextResponse.json({ conversationId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Conversation could not be started.") },
      { status: errorStatus(error, 403) },
    );
  }
}
