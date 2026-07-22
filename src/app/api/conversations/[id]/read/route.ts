import { NextResponse } from "next/server";
import { markConversationRead } from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await markConversationRead(request, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Read status could not be saved.") },
      { status: errorStatus(error, 403) },
    );
  }
}
