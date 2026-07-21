import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { allowRequest, clientKey, resetRateLimits } from "@/lib/rate-limit";
import { AppError, errorStatus, userMessage } from "@/lib/http";

describe("deployment hardening migration", () => {
  const path = "supabase/migrations/202607180010_deployment_hardening.sql";
  it("indexes the columns the application filters and orders on", () => {
    const sql = fs.readFileSync(path, "utf8");
    for (const index of ["calendar_items(user_id,start_at)", "calendar_items(status,end_at)", "meeting_participants(user_id)", "conversation_messages(conversation_id,created_at)", "private_activity_events(user_id,created_at desc)"]) expect(sql).toContain(index);
  });
  it("blocks reciprocal duplicate connections in the database", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("connections_pair_unique");
    expect(sql).toContain("least(requester_id,addressee_id),greatest(requester_id,addressee_id)");
  });
  it("saves destinations through an owner-checked definer function", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).toContain("save_calendar_destination");
    expect(sql).toContain("security definer set search_path=''");
    expect(sql).toContain("where id=p_item_id and user_id=actor for update");
    expect(sql).toContain("grant execute on function public.save_calendar_destination");
  });
  it("keeps coordinates out of the audit trail", () => {
    const sql = fs.readFileSync(path, "utf8");
    expect(sql).not.toMatch(/audit_events[\s\S]{0,200}p_latitude/);
  });
  it("audits connection and permission changes", () => {
    const sql = fs.readFileSync(path, "utf8");
    for (const action of ["connection_accepted", "connection_blocked", "connection_removed", "permission_updated"]) expect(sql).toContain(action);
  });
  it("is bundled into the single-file installer", () => {
    expect(fs.readFileSync("supabase/schema.sql", "utf8")).toContain("202607180010_deployment_hardening.sql");
  });
  it("routes destination writes away from the revoked authenticated update", () => {
    const server = fs.readFileSync("src/lib/journey/server.ts", "utf8");
    expect(server).toContain("save_calendar_destination");
    expect(server).not.toMatch(/from\("calendar_items"\)\.update/);
  });
});

describe("production request gating", () => {
  it("lets token and secret authenticated endpoints reach their handlers", () => {
    const proxy = fs.readFileSync("src/proxy.ts", "utf8");
    for (const path of ['"/book"', '"/api/booking"', '"/api/jobs/missed-starts"']) expect(proxy).toContain(path);
  });
  it("fails closed instead of serving the shared preview identity in production", () => {
    const proxy = fs.readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain("KAIROS_ALLOW_PREVIEW");
    expect(proxy).toContain("503");
  });
  it("declares a content security policy", () => {
    expect(fs.readFileSync("next.config.ts", "utf8")).toContain("Content-Security-Policy-Report-Only");
  });
  it("bounds the daily missed-start scan", () => {
    const cron = fs.readFileSync("src/app/api/jobs/missed-starts/route.ts", "utf8");
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toMatch(/limit\(5000\)/);
  });
});

describe("account creation is the only way in", () => {
  it("ships no demo seeding script or shared password", () => {
    expect(fs.existsSync("scripts/seed-demo.mjs")).toBe(false);
    expect(fs.readFileSync("package.json", "utf8")).not.toContain("seed:demo");
    expect(fs.readFileSync(".env.example", "utf8")).not.toContain("DEMO_ACCOUNT_PASSWORD");
  });
  it("offers a way to end a session", () => {
    expect(fs.readFileSync("src/app/auth/actions.ts", "utf8")).toContain("signOut");
  });
});

describe("interface depth and overflow", () => {
  it("defines every surface token the components reference", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    const defined = new Set([...css.matchAll(/(--[a-z-]+):/g)].map((match) => match[1]));
    const used = new Set([...fs.readdirSync("src/components").flatMap((file) => [...fs.readFileSync(`src/components/${file}`, "utf8").matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))]);
    expect([...used].filter((token) => !defined.has(token))).toEqual([]);
  });
  it("gives pointer and press feedback without breaking reduced motion", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("button{cursor:pointer}");
    expect(css).toContain("active{transform:scale(.97)}");
    expect(css).toContain("touch-action:manipulation");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
  it("wraps user supplied message text instead of overflowing the bubble", () => {
    expect(fs.readFileSync("src/components/conversation-panel.tsx", "utf8")).toContain("whitespace-pre-wrap break-words [overflow-wrap:anywhere]");
  });
});

describe("rate limiting", () => {
  afterEach(() => resetRateLimits());
  it("allows traffic under the limit and rejects the burst above it", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect(allowRequest("test:burst", 5)).toBe(true);
    expect(allowRequest("test:burst", 5)).toBe(false);
  });
  it("refills as the window elapses", () => {
    expect(allowRequest("test:refill", 1)).toBe(true);
    expect(allowRequest("test:refill", 1)).toBe(false);
    const later = Date.now() + 61_000, realNow = Date.now;
    Date.now = () => later;
    try { expect(allowRequest("test:refill", 1)).toBe(true); } finally { Date.now = realNow; }
  });
  it("separates callers by forwarded address and route", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientKey(headers, "auth")).toBe("auth:203.0.113.5");
    expect(clientKey(new Headers(), "auth")).toBe("auth:local");
  });
});

describe("error responses", () => {
  it("passes curated messages through and hides everything else", () => {
    expect(userMessage(new AppError("Conversation access denied."), "fallback")).toBe("Conversation access denied.");
    expect(userMessage(new Error('duplicate key value violates unique constraint "profiles_username_key"'), "Something went wrong.")).toBe("Something went wrong.");
    expect(errorStatus(new AppError("Too slow.", 409))).toBe(409);
  });
});
