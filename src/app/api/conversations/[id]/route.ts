import { NextResponse } from "next/server";
import {
  ensureAutomatedConversationUpdates,
  getConversationById,
} from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cursor = new URL(request.url).searchParams.get("before");

  try {
    const conversation = await getConversationById(request, id, cursor);
    if (!conversation)
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    if (!cursor)
      await ensureAutomatedConversationUpdates(request, conversation);
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Conversation could not be loaded.") },
      { status: errorStatus(error) },
    );
  }
}
