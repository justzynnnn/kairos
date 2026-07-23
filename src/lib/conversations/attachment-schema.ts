import { z } from "zod";

/**
 * The non-file half of an attachment upload, shared by the web route
 * (/api/conversations/[id]/attachments) and the mobile one. The file itself is
 * validated by content, not by this schema — see validAttachmentBytes.
 */
export const attachmentUploadFieldsSchema = z.object({
  body: z.string().max(4000),
  clientNonce: z.string().uuid(),
  relatedMeetingId: z.string().uuid().nullable().optional(),
});

export function attachmentUploadFields(form: FormData) {
  return attachmentUploadFieldsSchema.safeParse({
    body: String(form.get("body") ?? ""),
    clientNonce: String(form.get("clientNonce") ?? ""),
    relatedMeetingId: form.get("relatedMeetingId")
      ? String(form.get("relatedMeetingId"))
      : null,
  });
}
