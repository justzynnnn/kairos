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
    expect(app).toContain("Mori could not finish loading");
    expect(app).toContain("onRetry");
    expect(styles).toMatch(/\.field input,[\s\S]*font-size: 16px/);
    expect(styles).toContain("background-color: var(--canvas)");
    expect(bridge).toContain("webView?.scrollView.backgroundColor");
  });

  describe("theme system", () => {
    const styles = fs.readFileSync("mobile-src/styles.css", "utf8");

    function tokenValue(token: string, scheme: "light" | "dark") {
      const dark = styles.slice(
        styles.indexOf("@media (prefers-color-scheme: dark)"),
      );
      const source = scheme === "dark" ? dark : styles.slice(0, styles.length);
      const match = new RegExp(`--${token}:\\s*(#[0-9a-f]{3,8});`).exec(source);
      return match?.[1] ?? null;
    }

    it("defines every semantic token in both schemes", () => {
      const tokens = [
        "canvas",
        "surface",
        "surface-raised",
        "text",
        "text-muted",
        "line",
        "accent",
        "accent-soft",
        "danger",
        "success",
      ];
      expect(styles).toContain("color-scheme: light dark");
      for (const token of tokens) {
        expect(tokenValue(token, "light")).toMatch(/^#[0-9a-f]{6}$/);
        expect(tokenValue(token, "dark")).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    // A launch with no mismatched rectangles depends on four files agreeing on
    // one literal. Nothing at runtime can catch them drifting apart.
    it("mirrors --canvas in the meta tags and the native colour set", () => {
      const html = fs.readFileSync("mobile-src/index.html", "utf8");
      const colorset = JSON.parse(
        fs.readFileSync(
          "ios/App/App/Assets.xcassets/Canvas.colorset/Contents.json",
          "utf8",
        ),
      ) as {
        colors: Array<{
          appearances?: Array<{ value: string }>;
          color: { components: Record<string, string> };
        }>;
      };
      const nativeHex = (scheme: "light" | "dark") => {
        const entry = colorset.colors.find((value) =>
          scheme === "dark"
            ? value.appearances?.some((a) => a.value === "dark")
            : !value.appearances,
        )!;
        const { red, green, blue } = entry.color.components;
        return (
          "#" +
          red.slice(2) +
          green.slice(2) +
          blue.slice(2)
        ).toLowerCase();
      };
      for (const scheme of ["light", "dark"] as const) {
        const canvas = tokenValue("canvas", scheme)!;
        expect(html).toContain(
          `media="(prefers-color-scheme: ${scheme})"\n      content="${canvas}"`,
        );
        expect(nativeHex(scheme)).toBe(canvas);
      }
    });

    it("leaves no raw colour literals outside the token blocks", () => {
      const body = styles.slice(styles.indexOf("\n* {"));
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });

    it("renders vector tab icons and no system confirm dialog", () => {
      const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
      const planner = fs.readFileSync("mobile-src/pages/planner.tsx", "utf8");
      expect(app).toContain('from "./lib/icons"');
      expect(app).toContain("<entry.icon size={26}");
      expect(app).not.toMatch(/icon: "[^"]/);
      expect(app).not.toContain("sync-state");
      expect(planner).not.toContain("confirm(");
      expect(planner).toContain("<Sheet");
    });
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

  it("reaches first paint without a network round trip", () => {
    const auth = fs.readFileSync("mobile-src/lib/auth.tsx", "utf8");
    const data = fs.readFileSync("mobile-src/lib/data.tsx", "utf8");
    const capacitor = fs.readFileSync("capacitor.config.ts", "utf8");
    // The whole session is persisted, so a warm launch can hydrate from the
    // Keychain instead of trading a refresh token for a new one over the wire.
    expect(auth).toContain('sessionKey = "auth-session-v2"');
    expect(auth).toContain("expires_at");
    expect(auth).toContain("expiryGuardSeconds");
    // The cached snapshot paints regardless of the offline-mutation flag.
    expect(data).not.toMatch(/cached && mobileConfig\.features\.offlineSync/);
    // A foreground return is throttled rather than replaying the bootstrap.
    expect(data).toContain("visibilitychange");
    expect(data).not.toContain('addEventListener("focus"');
    expect(capacitor).toContain("launchAutoHide: false");
  });

  it("keeps validation and source maps out of the shipped launch path", () => {
    const data = fs.readFileSync("mobile-src/lib/data.tsx", "utf8");
    const store = fs.readFileSync("src/lib/mobile/store.ts", "utf8");
    const viteConfig = fs.readFileSync("vite.mobile.config.ts", "utf8");
    // Boot-path modules take types from the erased re-export barrel and reach
    // the zod schemas through a dynamic import, keeping ~68KB off startup.
    expect(data).toContain('from "@/lib/mobile/contracts-types"');
    expect(store).toContain('from "@/lib/mobile/contracts-types"');
    expect(data).not.toMatch(
      /^import \{[^}]*\} from "@\/lib\/mobile\/contracts"/m,
    );
    expect(store).not.toMatch(
      /^import \{[^}]*\} from "@\/lib\/mobile\/contracts"/m,
    );
    expect(store).toContain('await import("@/lib/mobile/contracts")');
    expect(viteConfig).toContain("sourcemap: false");
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

describe("phase 3 mobile API bridge", () => {
  it("scopes the shared engine layer to a bearer token without touching the cookie path", () => {
    const server = fs.readFileSync("src/lib/supabase/server.ts", "utf8");
    const data = fs.readFileSync("src/lib/data.ts", "utf8");
    expect(server).toContain('value?.startsWith("Bearer ")');
    expect(server).toContain("persistSession: false");
    expect(server).toContain("createServerClient(config.url, config.anonKey");
    expect(data).toContain("requestBearerAuthorization()");
    expect(data).toContain(
      'throw new AppError("Your mobile session has expired.", 401)',
    );
    expect(data).toContain('redirect("/auth")');
  });

  it("wraps the same profile engines the web routes call", () => {
    const settings = fs.readFileSync(
      "src/app/api/mobile/settings/route.ts",
      "utf8",
    );
    const preferences = fs.readFileSync(
      "src/app/api/mobile/preferences/route.ts",
      "utf8",
    );
    const preference = fs.readFileSync(
      "src/app/api/mobile/preferences/[id]/route.ts",
      "utf8",
    );
    const webSettings = fs.readFileSync(
      "src/app/api/profile/settings/route.ts",
      "utf8",
    );
    for (const route of [settings, preferences, preference]) {
      expect(route).toContain('export const runtime = "nodejs"');
      expect(route).toContain("authenticateBearerRequest(request)");
      expect(route).toContain("@/lib/profile/server");
    }
    // One schema module, imported by both clients, so validation cannot drift.
    expect(settings).toContain("@/lib/profile/settings-schema");
    expect(webSettings).toContain("@/lib/profile/settings-schema");
    expect(webSettings).not.toContain('from "zod"');
    expect(preference).toContain("preferenceSchema");
  });

  it("lets the phone reach the mutating verbs those routes expose", () => {
    const proxy = fs.readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('"GET, POST, PUT, PATCH, DELETE, OPTIONS"');
  });

  it("stops settings mutations and surfaces the pending queue while offline", () => {
    const settings = fs.readFileSync("mobile-src/pages/profile.tsx", "utf8");
    expect(settings).toContain(
      'const offline = !online || state === "offline"',
    );
    expect(settings).toContain("changes resume when you reconnect");
    expect(settings).toContain("pendingLocalOperations()");
    expect(settings).toContain("Sync now");
    expect(settings).not.toContain("/api/profile/");
  });
});

describe("phase 4 people, meetings, and attachments", () => {
  const routes = {
    people: "src/app/api/mobile/people/route.ts",
    search: "src/app/api/mobile/people/search/route.ts",
    request: "src/app/api/mobile/people/request/route.ts",
    manage: "src/app/api/mobile/people/[id]/manage/route.ts",
    match: "src/app/api/mobile/people/match/route.ts",
    meetings: "src/app/api/mobile/meetings/route.ts",
    respond: "src/app/api/mobile/meetings/[id]/respond/route.ts",
    attachments: "src/app/api/mobile/conversations/[id]/attachments/route.ts",
    attachment: "src/app/api/mobile/attachments/[id]/route.ts",
    conversation: "src/app/api/mobile/conversations/route.ts",
  } as const;
  const source = Object.fromEntries(
    Object.entries(routes).map(([name, path]) => [
      name,
      fs.readFileSync(path, "utf8"),
    ]),
  ) as Record<keyof typeof routes, string>;

  it("wraps engines instead of querying tables again", () => {
    for (const value of Object.values(source)) {
      expect(value).toContain('export const runtime = "nodejs"');
      expect(value).toContain("authenticateBearerRequest(request)");
      // A mobile route that reaches for a table directly is a second
      // implementation of a rule the web app already enforces.
      expect(value).not.toMatch(/\.from\(["'`]/);
    }
    expect(source.people).toContain("getConnections");
    expect(source.search).toContain("searchUsers");
    expect(source.request).toContain("requestConnection");
    expect(source.manage).toContain("manageConnection");
    expect(source.match).toContain("matchContacts");
    expect(source.meetings).toContain("listMeetings");
    expect(source.respond).toContain("actOnMeeting");
    expect(source.respond).toContain("recordMeetingActivity");
    expect(source.attachments).toContain("uploadConversationAttachment");
    expect(source.attachment).toContain("downloadAttachment");
    expect(source.conversation).toContain("startConversation");
  });

  it("keeps the web routes' rate limits on the phone's copies", () => {
    for (const value of [
      source.search,
      source.request,
      source.manage,
      source.match,
      source.conversation,
      source.attachments,
    ])
      expect(value).toContain("allowPersistentRequest");
  });

  it("validates meeting responses and uploads with one schema per shape", () => {
    const webRespond = fs.readFileSync(
      "src/app/api/meetings/[id]/respond/route.ts",
      "utf8",
    );
    const webAttachments = fs.readFileSync(
      "src/app/api/conversations/[id]/attachments/route.ts",
      "utf8",
    );
    for (const value of [webRespond, source.respond])
      expect(value).toContain("@/lib/meetings/respond-schema");
    for (const value of [webAttachments, source.attachments])
      expect(value).toContain("@/lib/conversations/attachment-schema");
    expect(webRespond).not.toContain('from "zod"');
    expect(webAttachments).not.toContain('from "zod"');
  });

  it("hands the phone a signed URL rather than a redirect it cannot follow", () => {
    expect(source.attachment).toContain('result.kind !== "redirect"');
    expect(source.attachment).toContain("{ url: result.url }");
    expect(source.attachment).toContain("no-store");
  });

  it("gives the inbox three segments that all degrade offline", () => {
    const inbox = fs.readFileSync("mobile-src/pages/inbox.tsx", "utf8");
    expect(inbox).toContain('type Segment = "chats" | "people" | "meetings"');
    expect(inbox).toContain('const offline = !online || state === "offline"');
    expect(inbox).toContain("Offline. Showing the last sync");
    // Cached copies so each segment paints without the network.
    expect(inbox).toContain("readLocalSnapshot<ConnectionCard[]>");
    expect(inbox).toContain("readLocalSnapshot<MeetingCard[]>");
    expect(inbox).toContain("attachment-chip");
    expect(inbox).toContain('type="file"');
    expect(inbox).toContain('"counter"');
    expect(inbox).toContain("/api/mobile/people/match");
    expect(inbox).not.toContain("/api/profile/");
  });

  it("counts what is waiting once, on the server", () => {
    const bootstrap = fs.readFileSync(
      "src/app/api/mobile/bootstrap/route.ts",
      "utf8",
    );
    const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
    expect(bootstrap).toContain("pendingConnectionCount");
    expect(bootstrap).toContain("actionableMeetingCount");
    expect(bootstrap).toContain("waitingOnActor");
    expect(app).toContain("pendingConnectionCount");
    expect(app).toContain("count-badge");
  });
});

describe("appearance and naming", () => {
  const styles = fs.readFileSync("mobile-src/styles.css", "utf8");

  it("applies the dark palette by system setting or by choice", () => {
    const media = styles.slice(
      styles.indexOf("@media (prefers-color-scheme: dark)"),
      styles.indexOf(':root[data-theme="dark"]'),
    );
    const explicit = styles.slice(
      styles.indexOf(':root[data-theme="dark"]'),
      styles.indexOf("\n* {"),
    );
    const declarations = (block: string) =>
      (block.match(/--[a-z0-9-]+:\s*#[0-9a-f]{3,8};/g) ?? []).sort();
    expect(declarations(media).length).toBeGreaterThan(20);
    // Two selectors, one palette: a token that darkens under only one of them
    // is a half-dark screen that appears the first time the toggle is used.
    expect(declarations(explicit)).toEqual(declarations(media));
    expect(media).toContain(':root:not([data-theme="light"])');
  });

  it("offers one control that cycles the appearance", () => {
    const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
    const theme = fs.readFileSync("mobile-src/lib/theme.ts", "utf8");
    const main = fs.readFileSync("mobile-src/main.tsx", "utf8");
    expect(app).toContain("ThemeButton");
    expect(app).toContain("nextTheme(preference)");
    expect(theme).toContain("root.dataset.theme");
    // Applied before the first render, so a chosen palette never flashes.
    expect(main).toContain("applyTheme(storedTheme())");
  });

  it("names the tab Settings and keeps the old hash working", () => {
    const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
    expect(app).toContain('{ id: "profile", label: "Settings"');
    expect(app).toContain("renamedTabs");
    expect(app).toContain('{ settings: "profile" }');
    expect(fs.existsSync("mobile-src/pages/profile.tsx")).toBe(true);
    expect(fs.existsSync("mobile-src/pages/settings.tsx")).toBe(false);
  });

  it("uses a mic for dictation instead of the word Voice", () => {
    const assistant = fs.readFileSync("mobile-src/pages/assistant.tsx", "utf8");
    expect(assistant).toContain("<Mic size={18}");
    expect(assistant).not.toContain('"Voice"');
  });
});

describe("phase 5 capture and onboarding", () => {
  const assistant = fs.readFileSync("mobile-src/pages/assistant.tsx", "utf8");
  const home = fs.readFileSync("mobile-src/pages/home.tsx", "utf8");
  const onboarding = fs.readFileSync("mobile-src/pages/onboarding.tsx", "utf8");
  const app = fs.readFileSync("mobile-src/app.tsx", "utf8");
  const draft = fs.readFileSync("mobile-src/lib/draft.ts", "utf8");

  it("names the assistant controls the way the web app does", () => {
    expect(assistant).toContain('{recording ? "Stop" : "Record"}');
    expect(assistant).toContain('{busy ? "Planning…" : "Review proposal"}');
    expect(assistant).toContain("<Mic size={18}");
    expect(assistant).toContain("<Square size={18}");
    expect(assistant).toContain("Schedule manually");
    expect(assistant).not.toContain('"Dictate"');
  });

  it("hands a Home capture to the Kairos tab exactly once", () => {
    // Module state, not a URL parameter: the tabs are separate lazy chunks.
    expect(draft).toContain("let pending: AssistantDraft | null = null");
    expect(draft).toContain("claimAssistantDraft");
    expect(draft).toContain("subscribeToAssistantDraft");
    expect(draft).toContain('location.hash = "#assistant"');
    expect(home).toContain("openAssistantWith({ text, submitted: true");
    expect(home).toContain("submitted: false, record: true");
    // Claimed during the first render so the text is in the box on first paint.
    expect(assistant).toContain("useState(peekAssistantDraft)");
    expect(assistant).toContain("!claimAssistantDraft(draft)");
    expect(assistant).toContain("if (draft.record) void startVoice();");
    expect(assistant).toContain("void interpret(metricNow(), draft.text)");
  });

  it("shows quick capture and deadline countdowns on Home", () => {
    expect(home).toContain('placeholder="What needs to happen?"');
    expect(home).toContain('aria-label="Record instead"');
    expect(home).toContain("Due soon");
    expect(home).toContain('item.type === "deadline"');
    expect(home).toContain("Intl.RelativeTimeFormat");
    // Both empty states lead back to the composer rather than a bare tab jump.
    expect(home).toContain('actionLabel="Capture something"');
    expect(home).toContain("onAction={focusCapture}");
    expect(home).not.toContain('location.hash = "#assistant"');
  });

  it("runs first-run setup once, behind a secure flag", () => {
    expect(app).toContain('const onboardedKey = "onboarded"');
    expect(app).toContain("getSecureValue(onboardedKey)");
    expect(app).toContain('setSecureValue(onboardedKey, "1")');
    expect(app).toContain("<Onboarding");
    // The shell must not paint before the flag is known.
    expect(app).toContain("signedIn && onboarded === null");
    expect(onboarding).toContain("Welcome");
    expect(onboarding).toContain('method: "PUT"');
    expect(onboarding).toContain("/api/mobile/settings");
    // The permission prompt is spent on a tap, never on arrival.
    expect(onboarding).toContain("onClick={() => void askForMicrophone()}");
    expect(onboarding).not.toMatch(/useEffect\([^)]*askForMicrophone/);
    expect(onboarding).toContain("Skip setup");
    expect(onboarding).toContain("openAssistantWith");
  });

  it("starts the audio session before the tap that depends on it", () => {
    const swift = fs.readFileSync(
      "ios/App/App/KairosIntelligencePlugin.swift",
      "utf8",
    );
    // An inactive session reports a zero sample rate, and installTap with that
    // format throws — which is a recorder that silently never hears anything.
    for (const body of swift.split("func ").slice(1)) {
      const activate = body.indexOf("setActive(true");
      const tap = body.indexOf("installTap(");
      if (activate < 0 || tap < 0) continue;
      expect(activate).toBeLessThan(tap);
    }
    expect(swift).toContain("guard format.sampleRate > 0");
    expect(swift).toContain("onDeviceRecognizer(preferring:");
    expect(swift).toContain("SPEECH_LOCALE_UNSUPPORTED");
  });
});

describe("capability visibility and local runs", () => {
  it("explains why on-device planning is unavailable and what to do", () => {
    const assistant = fs.readFileSync("mobile-src/pages/assistant.tsx", "utf8");
    const native = fs.readFileSync("src/lib/mobile/native.ts", "utf8");
    const swift = fs.readFileSync(
      "ios/App/App/KairosIntelligencePlugin.swift",
      "utf8",
    );
    // The reason, not just the fallback: "turned off" and "still downloading"
    // call for different actions.
    expect(assistant).toContain("capabilities.foundationModel.reason");
    expect(assistant).toContain(
      'capabilities.foundationModel.state === "downloading"',
    );
    expect(assistant).toContain("Check again");
    // A refused permission is never re-prompted, so the app offers Settings.
    expect(assistant).toContain("speechBlocked");
    expect(assistant).toContain("openAppSettings()");
    expect(native).toContain("openSettings");
    expect(swift).toContain("UIApplication.openSettingsURLString");
  });

  it("pins the browser suite to preview mode regardless of .env.local", () => {
    const config = fs.readFileSync("playwright.config.ts", "utf8");
    expect(config).toContain('NEXT_PUBLIC_SUPABASE_URL: ""');
    expect(config).toContain('KAIROS_ALLOW_PREVIEW: "1"');
    expect(config).toContain("PLAYWRIGHT_SUPABASE");
  });

  it("allows a local dev origin without weakening transport security", () => {
    const plist = fs.readFileSync("ios/App/App/Info.plist", "utf8");
    expect(plist).toContain("NSAllowsLocalNetworking");
    // The blanket escape hatches stay out.
    expect(plist).not.toContain("NSAllowsArbitraryLoads");
    expect(plist).not.toContain("NSExceptionAllowsInsecureHTTPLoads");
  });
});
