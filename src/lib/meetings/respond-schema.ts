import { z } from "zod";

/**
 * The meeting response request, shared by the web route
 * (/api/meetings/[id]/respond) and the mobile one. A counter-offer arriving
 * from a phone has to be held to the same shape as one from a browser.
 */
export const meetingRespondSchema = z.object({
  action: z.enum(["send", "accept", "counter", "decline", "confirm", "cancel"]),
  optionId: z.string().uuid().optional(),
  counterStart: z.iso.datetime({ offset: true }).optional(),
});

export type MeetingRespondRequest = z.infer<typeof meetingRespondSchema>;
