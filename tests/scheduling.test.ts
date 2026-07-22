import { describe, expect, it } from "vitest";
import { deterministicInterpret } from "@/lib/scheduling/fallback";
import {
  buildScheduleProposal,
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
