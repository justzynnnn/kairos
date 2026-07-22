import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeCloudContext } from "@/lib/scheduling/cloud-privacy";
import type { CalendarItem, Viewer } from "@/lib/types";

const viewer: Viewer = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "private@example.com",
  fullName: "Private User",
  username: "private_user",
  timezone: "Asia/Manila",
  activeStart: "07:00",
  activeEnd: "22:30",
  travelBufferMinutes: 15,
  avatarUrl: null,
  preview: false,
  scheduleVersion: 4,
};

function item(title: string): CalendarItem {
  return {
    id: crypto.randomUUID(),
    userId: viewer.id,
    type: "event",
    title,
    description: "secret description",
    startAt: "2026-07-24T02:00:00.000Z",
    endAt: "2026-07-24T03:00:00.000Z",
    dueAt: null,
    timezone: viewer.timezone,
    priority: 4,
    flexibility: "fixed",
    earliestStart: null,
    latestEnd: null,
    normalDurationMinutes: 60,
    minimumDurationMinutes: 60,
    minimumChunkMinutes: null,
    canShorten: false,
    canSplit: false,
    canSkip: false,
    locationLabel: "Secret clinic",
    category: "Health",
    reminderMinutes: 10,
    status: "scheduled",
    version: 1,
  };
}

describe("mobile intelligence privacy", () => {
  it("generalizes unrelated titles and strips prohibited scheduling fields", () => {
    const context = sanitizeCloudContext({
      command: "Find time for my report",
      viewer,
      calendar: [item("Dentist Appointment")],
      preferences: [],
      now: new Date("2026-07-23T00:00:00.000Z"),
    });
    expect(context.schedule[0]).toMatchObject({ title: "Busy" });
    expect(JSON.stringify(context)).not.toContain("Secret clinic");
    expect(JSON.stringify(context)).not.toContain("secret description");
    expect(JSON.stringify(context)).not.toContain(viewer.email);
  });

  it("reveals only a referenced title needed to resolve the command", () => {
    const context = sanitizeCloudContext({
      command: "Move my dentist appointment",
      viewer,
      calendar: [item("Dentist Appointment")],
      preferences: [],
      now: new Date("2026-07-23T00:00:00.000Z"),
    });
    expect(context.schedule[0].title).toBe("Dentist Appointment");
  });
});

describe("bundled mobile architecture", () => {
  it("ships local assets instead of a production server URL", () => {
    const config = fs.readFileSync("capacitor.config.ts", "utf8");
    const viteConfig = fs.readFileSync("vite.mobile.config.ts", "utf8");
    expect(config).toContain('webDir: "mobile-dist"');
    expect(config).toContain("KAIROS_MOBILE_DEV_SERVER_URL");
    expect(config).not.toContain("KAIROS_MOBILE_SERVER_URL");
    expect(viteConfig).toContain('envDir: ".."');
    expect(viteConfig).toContain('"NEXT_PUBLIC_"');
  });

  it("uses structured Apple generation and on-device speech", () => {
    const swift = fs.readFileSync(
      "ios/App/App/KairosIntelligencePlugin.swift",
      "utf8",
    );
    expect(swift).toContain("@Generable");
    expect(swift).toContain("generating: NativePlannerResponse.self");
    expect(swift).toContain("SpeechTranscriber");
    expect(swift).toContain("requiresOnDeviceRecognition = true");
  });

  it("keeps iPhone forms stable and exposes recoverable auth and loading states", () => {
    const auth = fs.readFileSync("mobile-src/lib/auth.tsx", "utf8");
    const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
    const styles = fs.readFileSync("mobile-src/styles.css", "utf8");
    const bridge = fs.readFileSync(
      "ios/App/App/KairosBridgeViewController.swift",
      "utf8",
    );
    expect(auth).toContain("Create account");
    expect(auth).toContain('"/auth/v1/signup"');
    expect(app).toContain("Kairos could not finish loading");
    expect(app).toContain("onRetry");
    expect(styles).toMatch(/\.field input,[\s\S]*font-size: 16px/);
    expect(styles).toContain("background-color: #f5f7fb");
    expect(bridge).toContain("webView?.scrollView.backgroundColor");
  });

  it("protects the offline queue and assistant history", () => {
    const swift = fs.readFileSync(
      "ios/App/App/KairosSecureStorePlugin.swift",
      "utf8",
    );
    expect(swift).toContain("import SQLite3");
    expect(swift).toContain("AES.GCM.seal");
    expect(swift).toContain("completeUntilFirstUserAuthentication");
    expect(swift).toContain("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
  });

  it("ships idempotent version-aware sync and content-free diagnostics", () => {
    const sync = fs.readFileSync(
      "supabase/migrations/202607230013_mobile_offline_sync.sql",
      "utf8",
    );
    const diagnostics = fs.readFileSync(
      "supabase/migrations/202607230014_mobile_diagnostics.sql",
      "utf8",
    );
    expect(sync).toContain("primary key(user_id,operation_id)");
    expect(sync).toContain("apply_mobile_schedule_operation");
    expect(sync).toContain("item.version<>p_target_version");
    expect(diagnostics).toContain("mobile_diagnostics_no_content");
    expect(diagnostics).not.toContain("user_id");
  });
});
