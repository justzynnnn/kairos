import { z } from "zod";

/**
 * Request shapes for friend discovery and connection management, shared by the
 * web routes under /api/profile/** and the mobile routes under /api/mobile/**.
 * One definition means the phone cannot be held to looser rules than a browser.
 */
export const userSearchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N}@._ -]+$/u);

export const connectionRequestSchema = z.object({ userId: z.string().uuid() });

export const connectionActionSchema = z.enum(["accept", "block", "remove"]);

export const manageConnectionSchema = z.object({
  id: z.string().uuid(),
  action: connectionActionSchema,
});

// Addresses are compared against existing accounts and dropped. Contacts who do
// not already use Kairos are never stored, logged, or echoed back.
export const contactMatchSchema = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(200),
});
