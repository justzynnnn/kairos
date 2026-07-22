import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadConversationAttachment } from "@/lib/conversations/server";
import { userMessage } from "@/lib/http";
import {
  allowPersistentRequest,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit-server";
export const runtime = "nodejs";
const fields = z.object({
  body: z.string().max(4000),
  clientNonce: z.string().uuid(),
  relatedMeetingId: z.string().uuid().nullable().optional(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await allowPersistentRequest(
      clientKey(request.headers, "attachments"),
      20,
    ))
  )
    return tooManyRequests();
  try {
    const form = await request.formData(),
      file = form.get("file"),
      parsed = fields.safeParse({
        body: String(form.get("body") ?? ""),
        clientNonce: String(form.get("clientNonce") ?? ""),
        relatedMeetingId: form.get("relatedMeetingId")
          ? String(form.get("relatedMeetingId"))
          : null,
      });
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
      { status: 422 },
    );
  }
}
