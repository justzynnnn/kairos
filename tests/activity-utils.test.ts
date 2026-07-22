import { describe, expect, it } from "vitest";
import { currentActivityStreak } from "@/lib/activity-utils";

describe("currentActivityStreak", () => {
  it("counts only consecutive active days ending with the current day", () => {
    expect(
      currentActivityStreak([
        { date: "2026-07-18", count: 2, level: 1 },
        { date: "2026-07-19", count: 1, level: 1 },
        { date: "2026-07-20", count: 0, level: 0 },
        { date: "2026-07-21", count: 4, level: 2 },
        { date: "2026-07-22", count: 1, level: 1 },
      ]),
    ).toBe(2);
  });

  it("does not continue a streak after a missed current day", () => {
    expect(
      currentActivityStreak([
        { date: "2026-07-20", count: 2, level: 1 },
        { date: "2026-07-21", count: 3, level: 2 },
        { date: "2026-07-22", count: 0, level: 0 },
      ]),
    ).toBe(0);
  });
});
