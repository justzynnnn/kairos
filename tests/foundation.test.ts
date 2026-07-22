import fs from "node:fs";
import { describe, expect, it } from "vitest";
describe("privacy boundaries", () => {
  it("does not expose server secrets", () => {
    const env = fs.readFileSync(".env.example", "utf8");
    for (const key of [
      "OPENAI_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_MAPS_API_KEY",
    ])
      expect(env).not.toContain(`NEXT_PUBLIC_${key}`);
  });
  it("never stores audio in Phase 1 routes", () => {
    const route = fs.readFileSync(
      "src/app/api/assistant/transcribe/route.ts",
      "utf8",
    );
    expect(route).not.toMatch(/storage|writeFile|insert\(/);
  });
  it("ships atomic proposal confirmation", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/202607180002_phase1_conversational_planning.sql",
      "utf8",
    );
    expect(sql).toContain("confirm_schedule_proposal");
    expect(sql).toContain("schedule_version");
    expect(sql).toContain("for update");
  });
});
describe("Phase 2 transaction boundaries", () => {
  it("ships atomic stale-safe repair approval", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/202607180003_phase2_schedule_repair.sql",
      "utf8",
    );
    expect(sql).toContain("confirm_repair_proposal");
    expect(sql).toContain("for update");
    expect(sql).toContain("schedule_version");
    expect(sql).toContain("status='stale'");
    expect(sql).toContain("Repair creates a calendar conflict");
  });
  it("protects the scheduled check endpoint", () => {
    const route = fs.readFileSync(
      "src/app/api/jobs/missed-starts/route.ts",
      "utf8",
    );
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Unauthorized");
  });
});
describe("Phase 3 privacy and state boundaries", () => {
  it("ships locked meeting transitions and final-confirmation calendar writes", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/202607180004_phase3_meeting_coordination.sql",
      "utf8",
    );
    expect(sql).toContain("respond_to_meeting");
    expect(sql).toContain("for update");
    expect(sql).toContain("awaiting_sender_confirmation");
    expect(sql).toContain("base_schedule_versions");
    expect(sql).toContain("profile.schedule_version");
    expect(sql).toContain("Participant schedule changed");
    expect(sql).toContain("external_booking_tokens");
  });
  it("never grants clients direct token-table access", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/202607180004_phase3_meeting_coordination.sql",
      "utf8",
    );
    expect(sql).toContain("revoke all on public.connections");
    expect(sql).not.toMatch(/grant select on public\.external_booking_tokens/);
  });
  it("documents both hosted setup paths", () => {
    expect(fs.existsSync("docs/SUPABASE_SETUP.md")).toBe(true);
    expect(fs.existsSync("docs/VERCEL_SETUP.md")).toBe(true);
  });
});

describe("Phase 4 messaging and file boundaries", () => {
  const path = "supabase/migrations/202607180005_phase4_inbox_and_files.sql";
  it("keeps messages participant-only, deduplicated, and system-safe", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("can_access_conversation");
    expect(sql).toContain("private_to");
    expect(sql).toContain("unique(conversation_id,client_nonce)");
    expect(sql).toContain("message_sender_shape");
    expect(sql).toContain("sender_kind='user'");
    expect(sql).not.toMatch(
      /grant (insert|update|delete).*conversation_messages.*authenticated/i,
    );
  });
  it("creates a private 10 MB restricted storage bucket without browser write policies", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain(
      "'kairos-attachments','kairos-attachments',false,10485760",
    );
    expect(sql).toContain(
      "'application/pdf','image/png','image/jpeg','image/webp','text/plain'",
    );
    expect(sql).not.toMatch(/create policy .*storage\.objects/i);
  });
  it("publishes message and attachment changes for realtime refresh", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("conversation_messages");
    expect(sql).toContain("message_attachments");
    expect(sql.match(/supabase_realtime/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("keeps contextual protection ahead of the action-oriented dashboard", () => {
    const source = fs.readFileSync("src/components/home-dashboard.tsx", "utf8");
    expect(source).toContain("<DayGuardian");
    expect(source).toContain("Next up");
    expect(source).toContain("Today&apos;s agenda");
    expect(source).toContain("ActivityHeatmap");
    expect(source).toContain("home-support-stack");
  });
});

describe("contextual repair and native traffic boundaries", () => {
  const path = "supabase/migrations/202607220011_contextual_repair_ios.sql";
  it("ships owner-only incident records and version-safe atomic Undo", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("daily_day_starts");
    expect(sql).toContain("unique(user_id,source_key)");
    expect(sql).toContain("for update");
    expect(sql).toContain("current_version<>incident.applied_schedule_version");
    expect(sql).toContain("original.flexibility<>'flexible'");
    expect(sql).toContain("dismissed_at=now()");
  });
  it("stores only a scoped token hash and no origin coordinates", () => {
    const sql = fs.readFileSync(path, "utf8"),
      session = fs.readFileSync("src/lib/journey/session-server.ts", "utf8");
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).not.toMatch(
      /origin_(latitude|longitude)|coordinate_history|access_token|refresh_token/i,
    );
    expect(session).toContain('createHash("sha256")');
    expect(session).not.toMatch(/access_token|refresh_token/);
  });
  it("configures iPhone background location with an explicit indicator", () => {
    const plist = fs.readFileSync("ios/App/App/Info.plist", "utf8"),
      swift = fs.readFileSync(
        "ios/App/App/KairosTripMonitorPlugin.swift",
        "utf8",
      );
    expect(plist).toContain("UIBackgroundModes");
    expect(plist).toContain("location");
    expect(swift).toContain("showsBackgroundLocationIndicator = true");
    expect(swift).toContain("location.distance(from: $0) >= 250");
    expect(swift).toContain("distance(from: destination) <= 100");
  });
});

describe("accepted-friend provisioning", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/202607180009_friend_permissions_messaging.sql",
    "utf8",
  );
  it("reactivates chat membership and grants missing free-busy access", () => {
    expect(sql).toContain(
      "on conflict(conversation_id,user_id)do update set removed_at=null",
    );
    expect(sql).toContain("where connection.status='accepted'");
    expect(sql).toContain("'free_busy'");
    expect(sql).toContain("p_action='accept'");
  });
});

describe("Phase 5 permission and activity boundaries", () => {
  const path =
    "supabase/migrations/202607180006_phase5_profiles_permissions_activity.sql";
  it("preserves historical per-friend migration behavior for installed databases", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("scope in('none','free_busy','categories')");
    expect(sql).toContain("update_schedule_permission");
    expect(sql).toContain("removed_at=now()");
  });
  it("keeps detailed activity private and browser-read-only", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("private_activity_select_own");
    expect(sql).toContain(
      "revoke all on public.private_activity_events from anon,authenticated",
    );
    expect(sql).toContain(
      "grant select on public.private_activity_events to authenticated",
    );
    expect(sql).not.toMatch(/grant insert on public\.private_activity_events/i);
  });
  it("shares only an aggregate behind explicit opt-in", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("activity_aggregate_sharing=true");
    expect(sql).toContain("get_shared_activity_aggregate");
    expect(sql).not.toMatch(
      /get_shared_activity_aggregate[\s\S]*select[^;]*(title|metadata|location)/i,
    );
  });
  it("refreshes the PWA cache and enables manipulation-safe taps", () => {
    expect(fs.readFileSync("public/sw.js", "utf8")).toContain(
      'CACHE="kairos-v6"',
    );
    expect(fs.readFileSync("src/app/globals.css", "utf8")).toMatch(
      /touch-action:\s*manipulation/,
    );
  });
});

describe("global schedule visibility and unread tracking", () => {
  const path = "supabase/migrations/202607220012_product_privacy_inbox.sql";
  it("defaults existing and new users to private and exposes intervals only", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain(
      "schedule_visibility text not null default 'private'",
    );
    expect(sql).toContain("can_view_schedule_availability");
    expect(sql).toContain(
      "returns table(start_at timestamptz,end_at timestamptz)",
    );
    expect(sql).not.toMatch(
      /returns table\([^)]*(title|description|location|category)/i,
    );
  });
  it("supports cursor reads and read markers", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("last_read_at");
    expect(sql).toContain("conversation_messages_cursor_idx");
    expect(sql).toContain("mark_conversation_read");
  });
});

describe("SQL Editor quick hosting", () => {
  const schemaPath = "supabase/schema.sql",
    demoMigration = "supabase/migrations/202607180007_sql_editor_demo_mode.sql";
  it("bundles every ordered migration into one fresh-project script", () => {
    const schema = fs.readFileSync(schemaPath, "utf8");
    for (const file of fs
      .readdirSync("supabase/migrations")
      .filter((entry) => entry.endsWith(".sql")))
      expect(schema).toContain(file);
    expect(schema).toContain("kairos_installation");
  });
  it("seeds and removes only marked demo records for the authenticated user", () => {
    const sql = fs.readFileSync(demoMigration, "utf8");
    expect(sql).toContain("actor uuid:=auth.uid()");
    expect(sql).toContain("demo_seeded=true");
    expect(sql).toContain("source_key like 'demo:%'");
    expect(sql).toContain("set_demo_mode");
  });
  it("supports Vercel Marketplace Supabase variable names without putting secrets in browser variables", () => {
    const publicEnv = fs.readFileSync("src/lib/env.ts", "utf8"),
      serverEnv = fs.readFileSync("src/lib/server-env.ts", "utf8"),
      example = fs.readFileSync(".env.example", "utf8");
    expect(publicEnv).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(serverEnv).toContain("SUPABASE_SECRET_KEY");
    expect(example).not.toMatch(/sk-(proj-)?[A-Za-z0-9_-]{16,}/);
    expect(example).not.toContain("NEXT_PUBLIC_SUPABASE_SECRET_KEY");
  });
});
