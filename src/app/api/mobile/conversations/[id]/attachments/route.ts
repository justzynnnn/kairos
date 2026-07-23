import { NextResponse } from "next/server";
import { attachmentUploadFields } from "@/lib/conversations/attachment-schema";
import {
  getConversationById,
  uploadConversationAttachment,
} from "@/lib/conversations/server";
import { errorStatus, userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
import { authenticateBearerRequest } from "@/lib/supabase/request";

export const runtime = "nodejs";

// Everything the thread already carries, flattened — the phone uses this to
// show a conversation's files without paging back through its messages.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateBearerRequest(request);
    const { id } = await params;
    const view = await getConversationById(request, id);
    if (!view)
      return NextResponse.json(
        { error: "Conversation access denied." },
        { status: 403 },
      );
    return NextResponse.json({
      attachments: view.messages.flatMap((message) =>
        message.attachments.map((attachment) => ({
          id: attachment.id,
          messageId: message.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          createdAt: message.createdAt,
        })),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Attachments could not be loaded.") },
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
      clientKey(request.headers, "mobile-attachments"),
      20,
    ))
  )
    return tooManyRequests();
  try {
    await authenticateBearerRequest(request);
    const form = await request.formData();
    const file = form.get("file");
    const parsed = attachmentUploadFields(form);
    if (!(file instanceof File) || !parsed.success)
      return NextResponse.json(
        { error: "Choose a valid attachment and message." },
        { status: 400 },
      );
    const { id } = await params;
    return NextResponse.json({
      id: await uploadConversationAttachment(
        request,
        id,
        file,
        parsed.data.body,
        parsed.data.clientNonce,
        parsed.data.relatedMeetingId ?? null,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: userMessage(error, "Attachment could not be uploaded.") },
      { status: errorStatus(error, 422) },
    );
  }
}
