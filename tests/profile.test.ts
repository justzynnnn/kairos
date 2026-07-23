import { beforeEach, describe, expect, it } from "vitest";
import { resetDemoCalendar, getDemoCalendarItems } from "@/lib/demo-data";
import {
  actOnPreviewConnection,
  completePreviewCalendarItem,
  createPreviewPreference,
  deletePreviewPreference,
  getPreviewSettings,
  listPreviewActivity,
  listPreviewConnections,
  listPreviewPreferences,
  recordPreviewActivity,
  requestPreviewConnection,
  resetPreviewProfile,
  searchPreviewUsers,
  softCancelPreviewCalendarItem,
  updatePreviewPreference,
  updatePreviewSettings,
} from "@/lib/profile/preview-store";
import { CHLOE_ID } from "@/lib/meetings/preview-store";
beforeEach(() => {
  resetDemoCalendar();
  resetPreviewProfile();
});
describe("Profile controls", () => {
  it("updates identity, active hours, automation, and one global sharing policy", () => {
    updatePreviewSettings({
      fullName: "Justin L.",
      activeStart: "08:00",
      locationEnabled: true,
      automationLateness: false,
      activityAggregateSharing: true,
      scheduleVisibility: "friends",
    });
    expect(getPreviewSettings()).toMatchObject({
      fullName: "Justin L.",
      activeStart: "08:00",
      locationEnabled: true,
      automationLateness: false,
      activityAggregateSharing: true,
      scheduleVisibility: "friends",
    });
    expect(getPreviewSettings()).not.toHaveProperty("demoMode");
  });
  it("defaults schedule visibility to private", () => {
    expect(getPreviewSettings().scheduleVisibility).toBe("private");
  });
  it("soft-cancels with an item version and rejects a stale replay", () => {
    const item = getDemoCalendarItems().find((entry) => entry.id === "gym")!;
    expect(softCancelPreviewCalendarItem(item.id, item.version)).toMatchObject({
      status: "cancelled",
      version: item.version + 1,
    });
    expect(() => softCancelPreviewCalendarItem(item.id, item.version)).toThrow(
      /schedule changed/i,
    );
  });
  it("removes a connection without changing the global privacy setting", () => {
    const connection = listPreviewConnections()[0];
    actOnPreviewConnection(connection.id, "remove");
    expect(
      listPreviewConnections().some((entry) => entry.id === connection.id),
    ).toBe(false);
    expect(getPreviewSettings().scheduleVisibility).toBe("private");
  });
  it("edits and deletes explicitly remembered preferences", () => {
    const preference = listPreviewPreferences()[0];
    updatePreviewPreference(preference.id, {
      ...preference,
      category: "Training",
      defaultDurationMinutes: 75,
    });
    expect(listPreviewPreferences()[0]).toMatchObject({
      category: "Training",
      defaultDurationMinutes: 75,
    });
    expect(deletePreviewPreference(preference.id)).toBe(true);
    expect(
      listPreviewPreferences().some((entry) => entry.id === preference.id),
    ).toBe(false);
  });
});
describe("Phase 5 private activity", () => {
  it("records task completion and schedule adherence without exposing it to another user", () => {
    completePreviewCalendarItem("gym");
    expect(
      getDemoCalendarItems().find((item) => item.id === "gym")?.status,
    ).toBe("completed");
    expect(listPreviewActivity().map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["task_completion", "schedule_adherence"]),
    );
    expect(
      listPreviewActivity(CHLOE_ID).some(
        (entry) => entry.sourceKey === "complete:gym",
      ),
    ).toBe(false);
  });
  it("deduplicates server-style activity source keys", () => {
    recordPreviewActivity("deadline", "Paper due", "deadline:paper", 3);
    recordPreviewActivity("deadline", "Paper due", "deadline:paper", 3);
    expect(
      listPreviewActivity().filter(
        (entry) => entry.sourceKey === "deadline:paper",
      ),
    ).toHaveLength(1);
  });
});
describe("Inbox friend discovery", () => {
  it("searches the user directory and sends a pending friend request", () => {
    const [noah] = searchPreviewUsers("noah");
    expect(noah).toMatchObject({
      name: "Noah Santos",
      username: "noah",
      connectionStatus: "none",
    });
    requestPreviewConnection(noah.id);
    expect(searchPreviewUsers("noah")[0]).toMatchObject({
      connectionStatus: "pending_outgoing",
    });
    expect(
      listPreviewConnections().find((entry) => entry.userId === noah.id),
    ).toMatchObject({ status: "pending", direction: "outgoing" });
  });
  it("does not create duplicate friend requests", () => {
    const [noah] = searchPreviewUsers("santos");
    const first = requestPreviewConnection(noah.id),
      second = requestPreviewConnection(noah.id);
    expect(second.id).toBe(first.id);
  });
});
describe("Remembered preferences", () => {
  it("creates, edits, and deletes a category default", () => {
    const created = createPreviewPreference({
      category: "Reading",
      defaultDurationMinutes: 45,
      flexibility: "flexible",
      canShorten: true,
      canSplit: false,
      canSkip: true,
    });
    expect(listPreviewPreferences()).toHaveLength(3);
    updatePreviewPreference(created.id, {
      category: "Reading",
      defaultDurationMinutes: 30,
      flexibility: "protected",
      canShorten: false,
      canSplit: false,
      canSkip: false,
    });
    expect(
      listPreviewPreferences().find((entry) => entry.id === created.id),
    ).toMatchObject({ defaultDurationMinutes: 30, flexibility: "protected" });
    expect(deletePreviewPreference(created.id)).toBe(true);
    expect(
      listPreviewPreferences().some((entry) => entry.id === created.id),
    ).toBe(false);
  });
  it("refuses a second preference for the same category", () => {
    expect(() =>
      createPreviewPreference({
        category: "fitness",
        defaultDurationMinutes: 30,
        flexibility: null,
        canShorten: false,
        canSplit: false,
        canSkip: false,
      }),
    ).toThrow(/already exists/i);
  });
});
describe("Profile request validation", () => {
  it("holds web and mobile writes to one schema", async () => {
    const { profileSettingsSchema, preferenceSchema } = await import(
      "@/lib/profile/settings-schema"
    );
    const settings = {
      fullName: "Justin L.",
      username: "Justin_L",
      timezone: "Asia/Manila",
      activeStart: "07:00",
      activeEnd: "22:30",
      travelBufferMinutes: 15,
      locationEnabled: true,
      automationReminders: true,
      automationLateness: true,
      activityAggregateSharing: false,
      scheduleVisibility: "private" as const,
    };
    expect(profileSettingsSchema.parse(settings).username).toBe("justin_l");
    expect(
      profileSettingsSchema.safeParse({ ...settings, username: "no" }).success,
    ).toBe(false);
    expect(
      profileSettingsSchema.safeParse({ ...settings, activeEnd: "06:00" })
        .success,
    ).toBe(false);
    expect(
      preferenceSchema.safeParse({
        category: "Reading",
        defaultDurationMinutes: 10,
        flexibility: null,
        canShorten: false,
        canSplit: false,
        canSkip: false,
      }).success,
    ).toBe(false);
  });
});
