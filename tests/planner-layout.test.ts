import { describe, expect, it } from "vitest";
import type { CalendarItem } from "@/lib/types";
import {
  instantAt,
  layoutDay,
  monthGrid,
  offsetToMinutes,
  minutesToOffset,
  snap,
  startOfWeek,
} from "../mobile-src/lib/planner-layout";

const zone = "Asia/Manila";
function item(id: string, start: string, end: string): CalendarItem {
  return {
    id,
    userId: "u",
    type: "event",
    title: id,
    description: null,
    startAt: start,
    endAt: end,
    dueAt: null,
    timezone: zone,
    priority: 3,
    flexibility: "fixed",
    earliestStart: null,
    latestEnd: null,
    normalDurationMinutes: 60,
    minimumDurationMinutes: 60,
    minimumChunkMinutes: null,
    canShorten: false,
    canSplit: false,
    canSkip: false,
    locationLabel: null,
    status: "scheduled",
    version: 1,
  };
}
// 2026-07-18 in Manila (+08:00).
const day = new Date("2026-07-18T04:00:00.000Z");

describe("planner layout", () => {
  it("gives overlapping events their own columns", () => {
    const layout = layoutDay(
      [
        item("a", "2026-07-18T01:00:00Z", "2026-07-18T03:00:00Z"), // 9-11 local
        item("b", "2026-07-18T02:00:00Z", "2026-07-18T04:00:00Z"), // 10-12 local
        item("c", "2026-07-18T06:00:00Z", "2026-07-18T07:00:00Z"), // 14-15, alone
      ],
      day,
      zone,
    );
    const byId = Object.fromEntries(
      layout.items.map((entry) => [entry.item.id, entry]),
    );
    expect(byId.a.column).toBe(0);
    expect(byId.b.column).toBe(1);
    expect(byId.a.columns).toBe(2);
    expect(byId.b.columns).toBe(2);
    // An event with nothing beside it keeps the full width.
    expect(byId.c.columns).toBe(1);
  });

  it("stretches the window to contain items outside working hours", () => {
    // 04:30 local, before the 06:00 default start.
    const layout = layoutDay(
      [item("early", "2026-07-17T20:30:00Z", "2026-07-17T21:30:00Z")],
      day,
      zone,
    );
    expect(layout.startMinute).toBe(4 * 60);
    // Nothing may be placed above the top of the canvas.
    expect(
      minutesToOffset(layout.items[0].startMinutes, layout),
    ).toBeGreaterThanOrEqual(0);
  });

  it("keeps the default window when everything fits inside it", () => {
    const layout = layoutDay(
      [item("mid", "2026-07-18T02:00:00Z", "2026-07-18T03:00:00Z")],
      day,
      zone,
    );
    expect(layout.startMinute).toBe(6 * 60);
    expect(layout.endMinute).toBe(23 * 60);
  });

  it("round-trips an offset back to the minute it came from", () => {
    const layout = layoutDay([], day, zone);
    const offset = minutesToOffset(9 * 60 + 30, layout);
    expect(Math.round(offsetToMinutes(offset, layout))).toBe(9 * 60 + 30);
  });

  it("snaps to a quarter hour", () => {
    expect(snap(607)).toBe(600);
    expect(snap(614)).toBe(615);
  });

  it("resolves a tapped slot to the right wall-clock time", () => {
    const at = instantAt(day, 13 * 60 + 30, zone);
    // 13:30 in Manila is 05:30 UTC.
    expect(at.toISOString()).toBe("2026-07-18T05:30:00.000Z");
  });

  it("builds a Monday-first six-week grid", () => {
    const grid = monthGrid(new Date("2026-07-15T00:00:00"));
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(startOfWeek(new Date("2026-07-18T00:00:00")).getDay()).toBe(1);
  });
});
