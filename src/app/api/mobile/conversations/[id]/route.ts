import { NextResponse } from "next/server";
import { z } from "zod";
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
    const { user } = await authenticateBearerRequest(request);
    const { id } = await params;
    if (!(await membership(id, user.id)))
      return NextResponse.json(
        { error: "Conversation access denied." },
        { status: 403 },
      );
    const admin = createAdminSupabaseClient();
    const before = new URL(request.url).searchParams.get("before");
    let query = admin
      .from("conversation_messages")
      .select("id,sender_id,sender_kind,body,created_at")
      .eq("conversation_id", id)
      .or(`private_to.is.null,private_to.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(51);
    if (before && !Number.isNaN(Date.parse(before)))
      query = query.lt("created_at", new Date(before).toISOString());
    const [{ data: rows, error }, { data: members }] = await Promise.all([
      query,
      admin
        .from("direct_conversation_members")
        .select("user_id")
        .eq("conversation_id", id)
        .is("removed_at", null),
      admin
        .from("direct_conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", id)
        .eq("user_id", user.id),
    ]);
    if (error) throw error;
    const otherId = (members ?? []).find(
      (member) => member.user_id !== user.id,
    )?.user_id;
    const { data: profile } = otherId
      ? await admin
          .from("profiles")
          .select("full_name")
          .eq("id", otherId)
          .maybeSingle()
      : { data: null };
    const selected = (rows ?? []).slice(0, 50).reverse();
    return NextResponse.json({
      id,
      name: profile?.full_name ?? "Kairos friend",
      messages: selected.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.created_at,
        mine: message.sender_id === user.id,
        system: message.sender_kind === "system",
      })),
      nextCursor: (rows ?? []).length > 50 ? selected[0]?.created_at : null,
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
