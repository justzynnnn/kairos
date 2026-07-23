import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getConversationById,
  markConversationRead,
} from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authenticateBearerRequest } from "@/lib/supabase/request";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";

const sendSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
  clientMessageId: z.string().uuid(),
});

async function membership(conversationId: string, userId: string) {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("direct_conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    const url = new URL(request.url);
    const beforeValue = url.searchParams.get("before");
    const before =
      beforeValue && !Number.isNaN(Date.parse(beforeValue))
        ? new Date(beforeValue).toISOString()
        : null;
    // The thread comes from the same engine the web app reads, so attachments,
    // system messages, and private-message filtering behave identically here.
    const view = await getConversationById(request, id, before);
    if (!view)
      return NextResponse.json(
        { error: "Conversation access denied." },
        { status: 403 },
      );
    await markConversationRead(request, id);
    return NextResponse.json({
      id: view.id,
      name: view.otherUser.name,
      messages: view.messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        mine: message.isMine,
        system: message.senderKind === "system",
        attachments: message.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
      })),
      nextCursor: view.nextCursor,
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Conversation could not be loaded.") },
      { status: errorStatus(error, 500) },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "mobile-message"),
      120,
    ))
  )
    return tooManyRequests();
  try {
    const { user } = await authenticateBearerRequest(request);
    const { id } = await params;
    const body = sendSchema.safeParse(await request.json().catch(() => null));
    if (!body.success)
      return NextResponse.json(
        { error: "Enter a message under 4,000 characters." },
        { status: 400 },
      );
    if (!(await membership(id, user.id)))
      return NextResponse.json(
        { error: "Conversation access denied." },
        { status: 403 },
      );
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("conversation_messages")
      .insert({
        id: body.data.clientMessageId,
        conversation_id: id,
        sender_id: user.id,
        sender_kind: "user",
        message_type: "text",
        body: body.data.body,
      })
      .select("id,body,created_at")
      .single();
    if (error && !/duplicate/i.test(error.message)) throw error;
    return NextResponse.json({
      message: data
        ? {
            id: data.id,
            body: data.body,
            createdAt: data.created_at,
            mine: true,
            system: false,
          }
        : {
            id: body.data.clientMessageId,
            body: body.data.body,
            createdAt: new Date().toISOString(),
            mine: true,
            system: false,
          },
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Message could not be sent.") },
      { status: errorStatus(error, 422) },
    );
  }
}
