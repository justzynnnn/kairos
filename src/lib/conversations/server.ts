import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  validAttachmentBytes,
} from "@/lib/conversations/files";
import {
  addPreviewAttachment,
  getPreviewAttachment,
  listPreviewConversationById,
  listPreviewConversationContacts,
  previewConversationIdFor,
  recordPreviewSystemMessage,
  sendPreviewMessage,
} from "@/lib/conversations/preview-store";
import type {
  ConversationContact,
  ConversationMessage,
  ConversationView,
  MessageType,
} from "@/lib/conversations/types";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { formatTime } from "@/lib/format";
import { AppError } from "@/lib/http";
import { CHLOE_ID, previewActor } from "@/lib/meetings/preview-store";
import type { MeetingCard } from "@/lib/meetings/types";
import {
  getProfileSettings,
  recordPrivateActivity,
} from "@/lib/profile/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const ATTACHMENT_BUCKET = "kairos-attachments";
const MESSAGE_PAGE_SIZE = 50;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_kind: "user" | "system";
  message_type: MessageType;
  body: string;
  private_to: string | null;
  related_meeting_id: string | null;
  created_at: string;
};

type RecentMessageRow = Pick<
  MessageRow,
  "conversation_id" | "sender_id" | "body" | "created_at" | "private_to"
>;

export async function conversationActor(request: Request) {
  return isSupabaseConfigured()
    ? getViewer()
    : previewActor(request.headers.get("x-demo-user"));
}

function uuidKey(value: string) {
  const hex = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

async function activeMembership(conversationId: string, actorId: string) {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("direct_conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", actorId)
    .is("removed_at", null)
    .maybeSingle();
  return Boolean(data);
}

async function findConversationForUsers(first: string, second: string) {
  const admin = createAdminSupabaseClient();
  const { data: firstRows } = await admin
    .from("direct_conversation_members")
    .select("conversation_id")
    .eq("user_id", first)
    .is("removed_at", null);
  const ids = (firstRows ?? []).map((row) => row.conversation_id);
  if (!ids.length) return null;
  const { data } = await admin
    .from("direct_conversation_members")
    .select("conversation_id")
    .eq("user_id", second)
    .is("removed_at", null)
    .in("conversation_id", ids)
    .limit(1)
    .maybeSingle();
  return data?.conversation_id ?? null;
}

async function ensureConversation(otherUserId: string) {
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("ensure_direct_conversation", {
    p_other_user: otherUserId,
  });
  if (result.error)
    throw new AppError("You can only message accepted friends.");
  return result.data as string;
}

export async function getConversationContacts(
  request: Request,
): Promise<ConversationContact[]> {
  const actor = await conversationActor(request);
  if (!isSupabaseConfigured()) return listPreviewConversationContacts(actor.id);

  const admin = createAdminSupabaseClient();
  const { data: connections, error } = await admin
    .from("connections")
    .select("requester_id,addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${actor.id},addressee_id.eq.${actor.id}`);
  if (error) throw new AppError("Friends could not be loaded.");
  const friendIds = (connections ?? []).map((connection) =>
    connection.requester_id === actor.id
      ? connection.addressee_id
      : connection.requester_id,
  );
  if (!friendIds.length) return [];

  const [{ data: profiles, error: profileError }, { data: actorMemberships }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", friendIds)
        .order("full_name"),
      admin
        .from("direct_conversation_members")
        .select("conversation_id,last_read_at")
        .eq("user_id", actor.id)
        .is("removed_at", null),
    ]);
  if (profileError) throw new AppError("Friends could not be loaded.");

  const conversationIds = (actorMemberships ?? []).map(
    (membership) => membership.conversation_id,
  );
  let otherMemberships: Array<{ conversation_id: string; user_id: string }> =
    [];
  let recentMessages: RecentMessageRow[] = [];
  if (conversationIds.length) {
    const [memberResult, messageResult] = await Promise.all([
      admin
        .from("direct_conversation_members")
        .select("conversation_id,user_id")
        .in("conversation_id", conversationIds)
        .neq("user_id", actor.id)
        .is("removed_at", null),
      admin
        .from("conversation_messages")
        .select("conversation_id,sender_id,body,created_at,private_to")
        .in("conversation_id", conversationIds)
        .or(`private_to.is.null,private_to.eq.${actor.id}`)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    otherMemberships = memberResult.data ?? [];
    recentMessages = (messageResult.data ?? []) as RecentMessageRow[];
  }

  const conversationByFriend = new Map(
    otherMemberships.map((membership) => [
      membership.user_id,
      membership.conversation_id,
    ]),
  );
  const readByConversation = new Map(
    (actorMemberships ?? []).map((membership) => [
      membership.conversation_id,
      membership.last_read_at as string | null,
    ]),
  );
  const messagesByConversation = new Map<string, RecentMessageRow[]>();
  for (const message of recentMessages) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  return (profiles ?? [])
    .map((profile): ConversationContact => {
      const conversationId = conversationByFriend.get(profile.id) ?? null;
      const messages = conversationId
        ? (messagesByConversation.get(conversationId) ?? [])
        : [];
      const last = messages[0];
      const lastReadAt = conversationId
        ? (readByConversation.get(conversationId) ?? null)
        : null;
      return {
        id: profile.id,
        name: profile.full_name,
        email: profile.email,
        conversationId,
        lastMessage: last?.body ?? null,
        lastMessageAt: last?.created_at ?? null,
        unreadCount: messages.filter(
          (message) =>
            message.sender_id !== actor.id &&
            (!lastReadAt || message.created_at > lastReadAt),
        ).length,
      };
    })
    .sort(
      (a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") ||
        a.name.localeCompare(b.name),
    );
}

export async function startConversation(request: Request, otherUserId: string) {
  const actor = await conversationActor(request);
  if (!isSupabaseConfigured()) {
    const id = previewConversationIdFor(actor.id, otherUserId);
    if (!id) throw new AppError("You can only message accepted friends.");
    return id;
  }
  return ensureConversation(otherUserId);
}

export async function getConversationById(
  request: Request,
  id: string,
  before: string | null = null,
): Promise<ConversationView | null> {
  const actor = await conversationActor(request);
  if (!isSupabaseConfigured())
    return listPreviewConversationById(actor.id, id, before, MESSAGE_PAGE_SIZE);
  if (!(await activeMembership(id, actor.id))) return null;

  const admin = createAdminSupabaseClient();
  let messageQuery = admin
    .from("conversation_messages")
    .select(
      "id,conversation_id,sender_id,sender_kind,message_type,body,private_to,related_meeting_id,created_at",
    )
    .eq("conversation_id", id)
    .or(`private_to.is.null,private_to.eq.${actor.id}`)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1);
  if (before) messageQuery = messageQuery.lt("created_at", before);

  const [{ data: members }, { data: rows }] = await Promise.all([
    admin
      .from("direct_conversation_members")
      .select(
        "user_id,profiles!direct_conversation_members_user_id_fkey(full_name,email)",
      )
      .eq("conversation_id", id)
      .is("removed_at", null),
    messageQuery,
  ]);
  const pageRows = (rows ?? []) as MessageRow[];
  const selectedRows = pageRows.slice(0, MESSAGE_PAGE_SIZE);
  const messageIds = selectedRows.map((message) => message.id);
  const { data: attachments } = messageIds.length
    ? await admin
        .from("message_attachments")
        .select("id,message_id,display_name,mime_type,size_bytes")
        .in("message_id", messageIds)
    : { data: [] };

  const other = (members ?? []).find((member) => member.user_id !== actor.id);
  const profile = other?.profiles as unknown as {
    full_name: string;
    email: string;
  } | null;
  const names = new Map(
    (members ?? []).map((member) => [
      member.user_id,
      (member.profiles as unknown as { full_name: string } | null)?.full_name ??
        "User",
    ]),
  );
  const byMessage = new Map<
    string,
    Array<{
      id: string;
      message_id: string;
      display_name: string;
      mime_type: string;
      size_bytes: number;
    }>
  >();
  for (const attachment of attachments ?? []) {
    const list = byMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    byMessage.set(attachment.message_id, list);
  }

  const messages = [...selectedRows].reverse().map(
    (message): ConversationMessage => ({
      id: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      senderName:
        message.sender_kind === "system"
          ? "Kairos"
          : (names.get(message.sender_id) ?? "User"),
      senderKind: message.sender_kind,
      type: message.message_type,
      body: message.body,
      isMine: message.sender_id === actor.id,
      private: Boolean(message.private_to),
      relatedMeetingId: message.related_meeting_id,
      createdAt: message.created_at,
      attachments: (byMessage.get(message.id) ?? []).map((entry) => ({
        id: entry.id,
        name: entry.display_name,
        mimeType: entry.mime_type,
        sizeBytes: entry.size_bytes,
        downloadPath: `/api/attachments/${entry.id}/download`,
        previewable:
          entry.mime_type.startsWith("image/") ||
          entry.mime_type === "application/pdf" ||
          entry.mime_type === "text/plain",
      })),
    }),
  );

  return {
    id,
    otherUser: {
      id: other?.user_id ?? "",
      name: profile?.full_name ?? "Friend",
      email: profile?.email ?? "",
    },
    messages,
    nextCursor:
      pageRows.length > MESSAGE_PAGE_SIZE
        ? (messages[0]?.createdAt ?? null)
        : null,
  };
}

export async function getConversation(request: Request, otherUserId: string) {
  const id = await startConversation(request, otherUserId);
  return getConversationById(request, id);
}

export async function markConversationRead(request: Request, id: string) {
  if (!isSupabaseConfigured()) return true;
  const actor = await conversationActor(request);
  if (!(await activeMembership(id, actor.id)))
    throw new AppError("Conversation access denied.");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: id,
  });
  if (error) throw new AppError("Read status could not be updated.");
  return true;
}

export async function sendConversationMessage(
  request: Request,
  conversationId: string,
  body: string,
  clientNonce: string,
  relatedMeetingId: string | null,
) {
  const actor = await conversationActor(request);
  if (!isSupabaseConfigured())
    return sendPreviewMessage(
      actor.id,
      conversationId,
      body,
      clientNonce,
      relatedMeetingId,
    );
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: conversationId,
    p_body: body,
    p_client_nonce: clientNonce,
    p_related_meeting: relatedMeetingId,
  });
  if (error) throw new AppError("This message could not be sent safely.");
  return data as string;
}

function safeName(name: string) {
  return (
    name
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 180) || "attachment"
  );
}

export async function uploadConversationAttachment(
  request: Request,
  conversationId: string,
  file: File,
  body: string,
  clientNonce: string,
  relatedMeetingId: string | null,
) {
  const actor = await conversationActor(request);
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type))
    throw new AppError("Use PDF, PNG, JPEG, WebP, or plain text files.");
  if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES)
    throw new AppError("Attachments must be between 1 byte and 10 MB.");
  const name = safeName(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validAttachmentBytes(file.type, bytes))
    throw new AppError("The file contents do not match an allowed file type.");
  if (!isSupabaseConfigured())
    return addPreviewAttachment(
      actor.id,
      conversationId,
      { name, mimeType: file.type, bytes },
      body,
      clientNonce,
      relatedMeetingId,
    );
  if (!(await activeMembership(conversationId, actor.id)))
    throw new AppError("Conversation access denied.");

  const messageId = await sendConversationMessage(
    request,
    conversationId,
    body || `Shared ${name}`,
    clientNonce,
    relatedMeetingId,
  );
  const attachmentId = randomUUID();
  const path = `${conversationId}/${attachmentId}-${name}`;
  const admin = createAdminSupabaseClient();
  const prior = await admin
    .from("message_attachments")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (prior.data) return prior.data.id;
  const uploaded = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploaded.error) throw new AppError("The attachment could not be stored.");
  const { error } = await admin.from("message_attachments").insert({
    id: attachmentId,
    conversation_id: conversationId,
    message_id: messageId,
    uploaded_by: actor.id,
    storage_path: path,
    display_name: name,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
    throw new AppError("The attachment could not be linked safely.");
  }
  return attachmentId;
}

export async function downloadAttachment(request: Request, id: string) {
  const actor = !isSupabaseConfigured()
    ? previewActor(new URL(request.url).searchParams.get("demoUser"))
    : await conversationActor(request);
  if (!isSupabaseConfigured()) {
    const value = getPreviewAttachment(actor.id, id);
    if (!value) return null;
    return {
      kind: "bytes" as const,
      bytes: value.bytes,
      mimeType: value.mimeType,
      name: value.name,
    };
  }
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("message_attachments")
    .select(
      "conversation_id,storage_path,display_name,mime_type,message_id,conversation_messages!inner(private_to)",
    )
    .eq("id", id)
    .maybeSingle();
  const privateTo = (
    data?.conversation_messages as unknown as {
      private_to: string | null;
    } | null
  )?.private_to;
  if (
    !data ||
    (privateTo && privateTo !== actor.id) ||
    !(await activeMembership(data.conversation_id, actor.id))
  )
    return null;
  const { data: signed, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(data.storage_path, 60, { download: data.display_name });
  if (error || !signed) return null;
  return { kind: "redirect" as const, url: signed.signedUrl };
}

async function insertRealSystemMessage(
  conversationId: string,
  type: Exclude<MessageType, "text">,
  body: string,
  key: string,
  options: {
    privateTo?: string | null;
    relatedMeetingId?: string | null;
    relatedProposalId?: string | null;
  } = {},
) {
  const admin = createAdminSupabaseClient();
  await admin.from("conversation_messages").upsert(
    {
      conversation_id: conversationId,
      sender_id: null,
      sender_kind: "system",
      message_type: type,
      body,
      client_nonce: uuidKey(key),
      private_to: options.privateTo ?? null,
      related_meeting_id: options.relatedMeetingId ?? null,
      related_proposal_id: options.relatedProposalId ?? null,
    },
    { onConflict: "conversation_id,client_nonce", ignoreDuplicates: true },
  );
}

export async function recordMeetingActivity(
  meeting: MeetingCard,
  action: string,
) {
  const users = meeting.participants.flatMap((participant) =>
    participant.userId ? [participant.userId] : [],
  );
  if (users.length !== 2) return;
  const body =
    action === "created"
      ? `${meeting.participants.find((participant) => participant.role === "organizer")?.name ?? "The organizer"} sent meeting options for ${meeting.title}.`
      : action === "confirm"
        ? `${meeting.title} was confirmed. Matching planner items were created.`
        : `${meeting.title} was updated: ${action}.`;
  const key = `meeting:${meeting.id}:${meeting.version}:${action}`;
  if (action === "confirm")
    await Promise.all(
      users.map((userId) =>
        recordPrivateActivity(
          userId,
          "meeting",
          meeting.title,
          `meeting:${meeting.id}:confirmed`,
          3,
          isSupabaseConfigured() ? meeting.id : null,
        ),
      ),
    );
  if (!isSupabaseConfigured()) {
    recordPreviewSystemMessage("meeting_card", body, uuidKey(key), {
      relatedMeetingId: meeting.id,
    });
    return;
  }
  const conversationId = await findConversationForUsers(users[0], users[1]);
  if (conversationId)
    await insertRealSystemMessage(conversationId, "meeting_card", body, key, {
      relatedMeetingId: meeting.id,
    });
}

export async function recordPrivateScheduleActivity(
  userId: string,
  body: string,
  key: string,
  proposalId: string | null = null,
) {
  if (!isSupabaseConfigured()) {
    recordPreviewSystemMessage("repair_card", body, uuidKey(key), {
      privateTo: userId,
    });
    return;
  }
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("direct_conversation_members")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  if (data)
    await insertRealSystemMessage(
      data.conversation_id,
      "repair_card",
      body,
      key,
      { privateTo: userId, relatedProposalId: proposalId },
    );
}

export async function ensureAutomatedConversationUpdates(
  request: Request,
  conversation: ConversationView,
) {
  const actor = await conversationActor(request);
  if (!isSupabaseConfigured()) return;
  const settings = await getProfileSettings();
  if (!settings.automationReminders && !settings.automationLateness) return;
  const now = Date.now();
  const items = await getCalendarItems();
  for (const item of items) {
    if (item.status !== "scheduled" || !item.startAt || !item.endAt) continue;
    const start = new Date(item.startAt).getTime();
    const end = new Date(item.endAt).getTime();
    if (
      settings.automationReminders &&
      start >= now &&
      start - now <= 30 * 60_000
    ) {
      await insertRealSystemMessage(
        conversation.id,
        "system_reminder",
        `${item.title} starts in ${Math.max(1, Math.ceil((start - now) / 60_000))} minutes.`,
        `reminder:${actor.id}:${item.id}:${item.startAt}`,
        { privateTo: actor.id },
      );
    } else if (
      settings.automationLateness &&
      end < now &&
      now - end <= 2 * 60 * 60_000
    ) {
      await insertRealSystemMessage(
        conversation.id,
        "system_lateness",
        `${item.title} may be running late.`,
        `lateness:${actor.id}:${item.id}:${item.endAt}`,
        { privateTo: actor.id },
      );
    }
  }
}

export async function sendApprovedLatenessStatus(
  request: Request,
  itemTitle: string,
  predictedArrival: string,
  delayMinutes: number,
) {
  const actor = await conversationActor(request);
  const contacts = await getConversationContacts(request);
  const recipient =
    contacts.find((contact) => contact.id === CHLOE_ID) ?? contacts[0];
  if (!recipient) throw new AppError("Add a friend before sharing an ETA.");
  const conversation = await getConversation(request, recipient.id);
  if (!conversation) throw new AppError("This chat is unavailable.");
  const body = `Running about ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"} late for ${itemTitle}. My estimated arrival is ${formatTime(predictedArrival, actor.timezone)}.`;
  await sendConversationMessage(
    request,
    conversation.id,
    body,
    randomUUID(),
    null,
  );
  return { conversationId: conversation.id, body };
}
