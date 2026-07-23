import { z } from "zod";

/**
 * Request shapes for the profile surface, shared by the web routes under
 * /api/profile/** and the mobile routes under /api/mobile/**. Both clients hit
 * the same engines, so both must be held to the same validation — a second copy
 * of these rules is a second place for them to drift.
 */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const profileSettingsSchema = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/, {
        message: "Username must be 3–32 letters, numbers, or underscores.",
      }),
    timezone: z.string().trim().min(3).max(80),
    activeStart: time,
    activeEnd: time,
    travelBufferMinutes: z.number().int().min(0).max(120),
    locationEnabled: z.boolean(),
    automationReminders: z.boolean(),
    automationLateness: z.boolean(),
    activityAggregateSharing: z.boolean(),
    scheduleVisibility: z.enum(["public", "friends", "private"]),
  })
  .refine((value) => value.activeStart < value.activeEnd, {
    message: "Active hours must end after they start.",
  });

export const preferenceSchema = z.object({
  category: z.string().trim().min(1).max(60),
  defaultDurationMinutes: z.number().int().min(15).max(1440).nullable(),
  flexibility: z.enum(["fixed", "protected", "flexible"]).nullable(),
  canShorten: z.boolean(),
  canSplit: z.boolean(),
  canSkip: z.boolean(),
});
