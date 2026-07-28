import { describe, expect, it } from "vitest";
import { deterministicInterpret } from "@/lib/scheduling/fallback";
import {
  buildScheduleProposal,
  planScheduleProposal,
  SchedulingValidationError,
  validateProposalItems,
} from "@/lib/scheduling/engine";
import { confirmProposalSchema } from "@/lib/scheduling/schema";
import type { CalendarItem, Preference } from "@/lib/types";
const now = new Date("2026-07-18T02:00:00.000Z"),
  command =
    "Add Systems Design class tomorrow from 10 to 11:30, gym after class for an hour, and my paper is due Friday at 5pm. Block 90 minutes for research.";
describe("Phase 1 deterministic interpretation", () => {
  it("preserves the compound demo command", () => {
    const x = deterministicInterpret(command, now);
    expect(x?.actions.map((a) => a.kind)).toEqual([
      "event",
      "task",
      "deadline",
      "preparation",
    ]);
    expect(x?.ambiguity).toBe(false);
  });
  it("requests preparation details for a bare deadline", () => {
    const x = deterministicInterpret("My paper is due Friday at 5pm", now);
    expect(x?.follow_up_kind).toBe("deadline_preparation");
    expect(x?.ambiguity).toBe(true);
  });
  it("creates multiple protected preparation sessions after follow-up", () => {
    const x = deterministicInterpret("My paper is due Friday at 5pm", now, {
      mode: "multiple",
      totalEffortMinutes: 120,
      sessionLengthMinutes: 60,
    })!;
    const items = buildScheduleProposal(x, [], [], now);
    expect(items.filter((i) => i.type === "preparation")).toHaveLength(2);
    expect(
      items
        .filter((i) => i.type === "preparation")
        .every((i) => i.canShorten === false && i.canSkip === false),
    ).toBe(true);
  });
  it("supports events that cross midnight", () => {
    const x = deterministicInterpret(
      "Add Night Class tomorrow from 11pm to 1am",
      now,
    )!;
    const event = x.actions[0];
    expect(new Date(event.end_at!).getTime()).toBeGreaterThan(
      new Date(event.start_at!).getTime(),
    );
  });
});
describe("compound commands stay compound", () => {
  // 08:00 Manila, so an unqualified morning time is still ahead of "now".
  const morning = new Date("2026-07-18T00:00:00.000Z");
  it("keeps every clause of a three-item command", () => {
    const x = deterministicInterpret(
      "Circuits 1 at 9-11:30am, lunch at 12 to 1pm, gym at 1:30 to 3pm",
      morning,
    )!;
    expect(x.actions).toHaveLength(3);
    expect(x.actions.map((a) => a.title)).toEqual([
      "Circuits 1",
      "Lunch",
      "Gym",
    ]);
    // The meridiem is stated once, at the end of each range, and has to carry
    // leftward: 9 is 9am, 12 is noon, 1:30 is the afternoon.
    expect(x.actions.map((a) => a.start_at?.slice(11, 16))).toEqual([
      "09:00",
      "12:00",
      "13:30",
    ]);
    expect(x.actions.map((a) => a.end_at?.slice(11, 16))).toEqual([
      "11:30",
      "13:00",
      "15:00",
    ]);
    expect(x.actions.every((a) => a.kind === "event")).toBe(true);
  });
  it("handles Filipino noon shorthand and unordered clauses", () => {
    const x = deterministicInterpret("lunch at 12nn, gym at 9am", morning)!;
    expect(x.actions).toHaveLength(2);
    expect(x.actions[0].start_at?.slice(11, 16)).toBe("12:00");
    expect(x.actions[1].start_at?.slice(11, 16)).toBe("09:00");
  });
  it("carries a stated day across later clauses", () => {
    const x = deterministicInterpret(
      "Add gym tomorrow at 6am for 45 minutes and dinner at 7pm",
      morning,
    )!;
    expect(x.actions).toHaveLength(2);
    expect(x.actions[0].start_at?.slice(0, 10)).toBe("2026-07-19");
    expect(x.actions[1].start_at?.slice(0, 10)).toBe("2026-07-19");
    expect(x.actions[0].duration_minutes).toBe(45);
  });
  it("resolves times against the caller's timezone", () => {
    const x = deterministicInterpret(
      "standup at 9am",
      morning,
      undefined,
      "America/New_York",
    )!;
    expect(x.actions[0].start_at).toContain("T09:00:00-04:00");
  });
});
describe("partial placement", () => {
  const now = new Date("2026-07-18T00:00:00.000Z");
  it("keeps the placeable items when one action cannot fit", () => {
    const blocked = [
      {
        id: "busy",
        userId: "u",
        type: "event",
        title: "Standing Meeting",
        description: null,
        startAt: "2026-07-18T01:00:00.000Z",
        endAt: "2026-07-18T03:30:00.000Z",
        dueAt: null,
        timezone: "Asia/Manila",
        priority: 5,
        flexibility: "fixed",
        earliestStart: null,
        latestEnd: null,
        normalDurationMinutes: 150,
        minimumDurationMinutes: 150,
        minimumChunkMinutes: null,
        canShorten: false,
        canSplit: false,
        canSkip: false,
        locationLabel: null,
        status: "scheduled",
        version: 1,
      } satisfies CalendarItem,
    ];
    const intent = deterministicInterpret(
      "Circuits 1 at 9-11:30am, lunch at 12 to 1pm, gym at 1:30 to 3pm",
      now,
    )!;
    const plan = planScheduleProposal(intent, blocked, [], now);
    expect(plan.items.map((i) => i.title)).toEqual(["Lunch", "Gym"]);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].title).toBe("Circuits 1");
    expect(plan.rejected[0].reason).toContain("Standing Meeting");
    // The strict wrapper still refuses the whole request, which is what the
    // web confirmation route depends on.
    expect(() => buildScheduleProposal(intent, blocked, [], now)).toThrow(
      SchedulingValidationError,
    );
  });
});
describe("Phase 1 deterministic validation", () => {
  it("builds a conflict-free compound proposal", () => {
    const x = deterministicInterpret(command, now)!;
    const items = buildScheduleProposal(x, [], [], now);
    expect(items).toHaveLength(4);
    expect(() => validateProposalItems(items, [])).not.toThrow();
    const deadline = items.find((i) => i.type === "deadline")!,
      prep = items.find((i) => i.type === "preparation")!;
    expect(new Date(prep.endAt!).getTime()).toBeLessThanOrEqual(
      new Date(deadline.dueAt!).getTime(),
    );
  });
  it("rejects overlap with an existing commitment", () => {
    const existing = [
      {
        id: "fixed",
        userId: "u",
        type: "event",
        title: "Fixed",
        description: null,
        startAt: "2026-07-19T02:00:00.000Z",
        endAt: "2026-07-19T04:00:00.000Z",
        dueAt: null,
        timezone: "Asia/Manila",
        priority: 5,
        flexibility: "fixed",
        earliestStart: null,
        latestEnd: null,
        normalDurationMinutes: 120,
        minimumDurationMinutes: 120,
        minimumChunkMinutes: null,
        canShorten: false,
        canSplit: false,
        canSkip: false,
        locationLabel: null,
        status: "scheduled",
        version: 1,
      } satisfies CalendarItem,
    ];
    expect(() =>
      buildScheduleProposal(
        deterministicInterpret(command, now)!,
        existing,
        [],
        now,
      ),
    ).toThrow(SchedulingValidationError);
  });
  it("applies explicit remembered category defaults", () => {
    const intent = deterministicInterpret("Gym for one hour", now)!;
    const prefs = [
      {
        id: "p",
        category: "Fitness",
        defaultDurationMinutes: 45,
        flexibility: "protected",
        canShorten: false,
        canSplit: false,
        canSkip: false,
      } satisfies Preference,
    ];
    expect(buildScheduleProposal(intent, [], prefs, now)[0].flexibility).toBe(
      "protected",
    );
  });
  it("rejects malformed confirmation payloads", () => {
    expect(
      confirmProposalSchema.safeParse({
        proposalId: "not-a-uuid",
        items: [],
        remember: false,
      }).success,
    ).toBe(false);
  });
});
