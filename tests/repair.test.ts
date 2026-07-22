import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildRepairSolution,
  detectMissedStarts,
  validateRepairAlternative,
} from "@/lib/repair/engine";
import {
  localDay,
  trafficRepairRequest,
  wakeRepairRequest,
} from "@/lib/repair/incident-math";
import {
  applyPreviewAutomaticRepair,
  dismissPreviewRepairIncident,
  latestPreviewIncident,
  recordPreviewDayStart,
  resetPreviewRepairIncidents,
  undoPreviewAutomaticRepair,
} from "@/lib/repair/incident-preview-store";
import {
  getDemoCalendarItems,
  getDemoScheduleVersion,
  replaceDemoCalendarItems,
  resetDemoCalendar,
} from "@/lib/demo-data";
import type { CalendarItem } from "@/lib/types";

const user = "11111111-1111-4111-8111-111111111111";
const at = (hour: number, minute = 0, day = 18) =>
  `2026-07-${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
function item(
  value: Partial<CalendarItem> &
    Pick<CalendarItem, "id" | "title" | "startAt" | "endAt">,
): CalendarItem {
  return {
    userId: user,
    type: "task",
    description: null,
    dueAt: null,
    timezone: "Asia/Manila",
    priority: 3,
    flexibility: "flexible",
    earliestStart: value.startAt,
    latestEnd: at(22),
    normalDurationMinutes:
      value.startAt && value.endAt
        ? (new Date(value.endAt).getTime() -
            new Date(value.startAt).getTime()) /
          60000
        : null,
    minimumDurationMinutes: null,
    minimumChunkMinutes: null,
    canShorten: false,
    canSplit: false,
    canSkip: false,
    locationLabel: null,
    relatedDeadlineId: null,
    dependencyIds: [],
    category: "Work",
    reminderMinutes: 10,
    status: "scheduled",
    version: 1,
    ...value,
    id: value.id,
    title: value.title,
    startAt: value.startAt,
    endAt: value.endAt,
  };
}

describe("Phase 2 deterministic repair", () => {
  it("repairs a 45-minute late start without moving fixed class or losing preparation", () => {
    const calendar = [
      item({
        id: "class",
        title: "Systems Design Class",
        type: "event",
        flexibility: "fixed",
        startAt: at(10),
        endAt: at(11, 30),
        priority: 5,
      }),
      item({
        id: "gym",
        title: "Gym",
        startAt: at(12, 15),
        endAt: at(13, 15),
        earliestStart: at(11, 30),
        latestEnd: at(18),
      }),
      item({
        id: "prep",
        title: "Paper Research",
        type: "preparation",
        startAt: at(14),
        endAt: at(15, 30),
        earliestStart: at(13, 30),
        latestEnd: at(19, 0, 19),
        normalDurationMinutes: 90,
        minimumDurationMinutes: 90,
        minimumChunkMinutes: 30,
        canSplit: true,
        priority: 4,
        relatedDeadlineId: "deadline",
      }),
      item({
        id: "deadline",
        title: "Paper Due",
        type: "deadline",
        startAt: null,
        endAt: null,
        dueAt: at(17, 0, 20),
        flexibility: "fixed",
        priority: 5,
      }),
    ];
    const solution = buildRepairSolution(calendar, {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    const recommended = solution.alternatives[0];
    expect(() =>
      validateRepairAlternative(calendar, recommended),
    ).not.toThrow();
    expect(
      recommended.resultingItems.find((entry) => entry.id === "class")?.startAt,
    ).toBe(at(10));
    const prepParts = recommended.resultingItems.filter(
      (entry) => entry.id === "prep" || entry.id.startsWith("prep-split"),
    );
    expect(
      prepParts.reduce(
        (sum, entry) =>
          sum +
          (new Date(entry.endAt!).getTime() -
            new Date(entry.startAt!).getTime()) /
            60000,
        0,
      ),
    ).toBe(90);
    expect(
      prepParts.every(
        (entry) => new Date(entry.endAt!) <= new Date(at(17, 0, 20)),
      ),
    ).toBe(true);
  });

  it("offers a split alternative that preserves total effort and minimum fragments", () => {
    const calendar = [
      item({
        id: "focus",
        title: "Two-hour focus",
        startAt: at(9),
        endAt: at(11),
        latestEnd: at(14),
        normalDurationMinutes: 120,
        minimumDurationMinutes: 120,
        minimumChunkMinutes: 30,
        canSplit: true,
      }),
      item({
        id: "fixed",
        title: "Fixed call",
        type: "event",
        flexibility: "fixed",
        startAt: at(10),
        endAt: at(12),
      }),
    ];
    const solution = buildRepairSolution(calendar, {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    const split = solution.alternatives.find((alternative) =>
      alternative.operations.some((operation) => operation.kind === "split"),
    );
    expect(split).toBeTruthy();
    const operation = split!.operations.find(
      (entry) => entry.itemId === "focus",
    )!;
    expect(
      operation.after.reduce((sum, part) => sum + part.durationMinutes, 0),
    ).toBe(120);
    expect(operation.after.every((part) => part.durationMinutes >= 30)).toBe(
      true,
    );
  });

  it("uses shortening and skipping only when explicitly permitted by item constraints", () => {
    const fixed = item({
      id: "fixed",
      title: "Fixed",
      type: "event",
      flexibility: "fixed",
      startAt: at(10),
      endAt: at(12),
    });
    const short = item({
      id: "short",
      title: "Shortenable",
      startAt: at(9),
      endAt: at(10),
      latestEnd: at(10),
      normalDurationMinutes: 60,
      minimumDurationMinutes: 15,
      canShorten: true,
    });
    const optional = item({
      id: "optional",
      title: "Optional",
      startAt: at(9),
      endAt: at(10),
      latestEnd: at(10),
      canSkip: true,
    });
    const shortened = buildRepairSolution([fixed, short], {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(
      shortened.status === "proposal" &&
        shortened.alternatives[0].operations[0].kind,
    ).toBe("shorten");
    const skipped = buildRepairSolution([fixed, optional], {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(
      skipped.status === "proposal" &&
        skipped.alternatives[0].operations[0].kind,
    ).toBe("skip");
  });

  it("explains an impossible uncompromised schedule", () => {
    const calendar = [
      item({
        id: "task",
        title: "Required",
        startAt: at(9),
        endAt: at(10),
        latestEnd: at(10),
      }),
      item({
        id: "fixed",
        title: "Fixed",
        type: "event",
        flexibility: "fixed",
        startAt: at(9, 45),
        endAt: at(12),
      }),
    ];
    const solution = buildRepairSolution(calendar, {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(solution.status).toBe("impossible");
    if (solution.status === "impossible")
      expect(solution.compromises[0]).toMatch(/shortening/i);
  });

  it("detects missed starts without changing anything", () => {
    const calendar = [
      item({ id: "past", title: "Past", startAt: at(8), endAt: at(9) }),
      item({ id: "future", title: "Future", startAt: at(12), endAt: at(13) }),
    ];
    expect(
      detectMissedStarts(calendar, new Date(at(10))).map((entry) => entry.id),
    ).toEqual(["past"]);
  });

  it("never moves protected work or breaks dependencies", () => {
    const protectedItem = item({
      id: "protected",
      title: "Protected review",
      flexibility: "protected",
      startAt: at(10),
      endAt: at(11),
      priority: 5,
    });
    const dependent = item({
      id: "dependent",
      title: "Follow-up",
      startAt: at(11),
      endAt: at(12),
      dependencyIds: ["protected"],
      latestEnd: at(18),
    });
    const solution = buildRepairSolution([protectedItem, dependent], {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    for (const alternative of solution.alternatives) {
      expect(
        alternative.resultingItems.find((entry) => entry.id === "protected")
          ?.startAt,
      ).toBe(at(10));
      expect(
        new Date(
          alternative.resultingItems.find(
            (entry) => entry.id === "dependent",
          )!.startAt!,
        ).getTime(),
      ).toBeGreaterThanOrEqual(new Date(at(11)).getTime());
    }
  });

  it("can move overflow to a valid slot within seven days", () => {
    const flexible = item({
      id: "overflow",
      title: "Overflow",
      startAt: at(21),
      endAt: at(22),
      latestEnd: at(22, 0, 20),
    });
    const blocker = item({
      id: "blocker",
      title: "Evening commitment",
      type: "event",
      flexibility: "fixed",
      startAt: at(21, 45),
      endAt: at(23),
      earliestStart: null,
      latestEnd: null,
    });
    const solution = buildRepairSolution([flexible, blocker], {
      trigger: "fix_day",
      delayMinutes: 45,
      now: new Date(at(8)),
    });
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    const moved = solution.alternatives[0].resultingItems.find(
      (entry) => entry.id === "overflow",
    )!;
    expect(new Date(moved.startAt!).getTime()).toBeGreaterThan(
      new Date(flexible.startAt!).getTime(),
    );
    expect(
      new Date(moved.endAt!).getTime() - new Date(flexible.startAt!).getTime(),
    ).toBeLessThanOrEqual(7 * 24 * 60 * 60_000);
  });

  it("preserves travel buffers between different locations", () => {
    const fixed = item({
      id: "fixed",
      title: "Campus class",
      type: "event",
      flexibility: "fixed",
      startAt: at(10),
      endAt: at(11),
      locationLabel: "Campus",
    });
    const flexible = item({
      id: "flex",
      title: "Library work",
      startAt: at(11),
      endAt: at(12),
      latestEnd: at(14),
      locationLabel: "Library",
    });
    const solution = buildRepairSolution([fixed, flexible], {
      trigger: "fix_day",
      delayMinutes: 0,
      now: new Date(at(8)),
      travelBufferMinutes: 15,
    });
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    const moved = solution.alternatives[0].resultingItems.find(
      (entry) => entry.id === "flex",
    )!;
    expect(moved.startAt).toBe(new Date(at(11, 15)).toISOString());
    expect(() =>
      validateRepairAlternative(
        [fixed, flexible],
        solution.alternatives[0],
        15,
      ),
    ).not.toThrow();
  });

  it("satisfies hard constraints across randomized 15-minute delays", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }),
        fc.boolean(),
        (units, split) => {
          const task = item({
            id: "task",
            title: "Flexible",
            startAt: at(8),
            endAt: at(9),
            latestEnd: at(22),
            minimumChunkMinutes: 15,
            canSplit: split,
          });
          const fixed = item({
            id: "fixed",
            title: "Fixed class",
            type: "event",
            flexibility: "fixed",
            startAt: at(12),
            endAt: at(13),
            priority: 5,
          });
          const solution = buildRepairSolution([task, fixed], {
            trigger: "fix_day",
            delayMinutes: units * 15,
            now: new Date(at(7)),
          });
          if (solution.status !== "proposal") return false;
          return solution.alternatives.every((alternative) =>
            validateRepairAlternative([task, fixed], alternative),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("contextual day-start and traffic repair", () => {
  beforeEach(() => {
    resetDemoCalendar();
    resetPreviewRepairIncidents();
  });

  it("shortens an adjustable 8:00–8:30 shower to 8:15–8:30 when its minimum allows", () => {
    const shower = item({
      id: "shower",
      title: "Shower",
      startAt: at(8),
      endAt: at(8, 30),
      latestEnd: at(8, 30),
      normalDurationMinutes: 30,
      minimumDurationMinutes: 15,
      canShorten: true,
    });
    const request = wakeRepairRequest(
      [shower],
      new Date(at(8, 15)),
      "Asia/Manila",
    );
    expect(request).toMatchObject({ trigger: "woke_late", delayMinutes: 15 });
    const solution = buildRepairSolution([shower], request!);
    expect(solution.status).toBe("proposal");
    if (solution.status !== "proposal") return;
    expect(solution.alternatives[0].operations[0]).toMatchObject({
      kind: "shorten",
      after: [
        {
          startAt: new Date(at(8, 15)).toISOString(),
          endAt: new Date(at(8, 30)).toISOString(),
          durationMinutes: 15,
        },
      ],
    });
  });

  it("does not create a day-start repair before an adjustable task begins", () => {
    const future = item({
      id: "future",
      title: "Future",
      startAt: at(9),
      endAt: at(10),
    });
    expect(
      wakeRepairRequest([future], new Date(at(8, 59)), "Asia/Manila"),
    ).toBeNull();
  });

  it("routes an affected protected item to explicit review without changing it", () => {
    const protectedItem = item({
      id: "protected",
      title: "Protected routine",
      flexibility: "protected",
      startAt: at(8),
      endAt: at(9),
    });
    const request = wakeRepairRequest(
      [protectedItem],
      new Date(at(8, 15)),
      "Asia/Manila",
    )!;
    expect(request.requiresProtectedReview).toBe(true);
    expect(buildRepairSolution([protectedItem], request)).toMatchObject({
      status: "impossible",
    });
    const review = buildRepairSolution([protectedItem], {
      ...request,
      allowProtected: true,
    });
    expect(review.status).toBe("proposal");
  });

  it("uses local calendar dates and preserves the five-minute traffic threshold", () => {
    expect(localDay(new Date("2026-07-17T16:30:00.000Z"), "Asia/Manila")).toBe(
      "2026-07-18",
    );
    expect(
      trafficRepairRequest("item", new Date(at(9)).toISOString(), 5)
        .delayMinutes,
    ).toBe(5);
  });

  it("records only the first open per local day", () => {
    expect(recordPreviewDayStart("2026-07-18")).toBe(true);
    expect(recordPreviewDayStart("2026-07-18")).toBe(false);
    expect(recordPreviewDayStart("2026-07-19")).toBe(true);
  });

  it("deduplicates, dismisses, and safely undoes preview incidents", () => {
    const shower = item({
      id: "shower",
      title: "Shower",
      startAt: at(8),
      endAt: at(8, 30),
      latestEnd: at(10),
      normalDurationMinutes: 30,
      minimumDurationMinutes: 15,
      canShorten: true,
    });
    expect(replaceDemoCalendarItems([shower], getDemoScheduleVersion())).toBe(
      true,
    );
    const request = wakeRepairRequest(
      [shower],
      new Date(at(8, 15)),
      "Asia/Manila",
    )!;
    const first = applyPreviewAutomaticRepair(
      request,
      "Late start",
      "wake:2026-07-18",
      "2026-07-18",
    )!;
    const versionAfterApply = getDemoScheduleVersion();
    const duplicate = applyPreviewAutomaticRepair(
      request,
      "Late start",
      "wake:2026-07-18",
      "2026-07-18",
    )!;
    expect(duplicate.id).toBe(first.id);
    expect(getDemoScheduleVersion()).toBe(versionAfterApply);
    expect(undoPreviewAutomaticRepair(first.id).status).toBe("undone");
    expect(getDemoCalendarItems()[0]).toMatchObject({
      startAt: shower.startAt,
      endAt: shower.endAt,
      status: "scheduled",
    });

    const protectedRequest = { ...request, requiresProtectedReview: true };
    const attention = applyPreviewAutomaticRepair(
      protectedRequest,
      "Protected start",
      "protected:2026-07-18",
      "2026-07-18",
    )!;
    expect(latestPreviewIncident({ localDate: "2026-07-18" })?.id).toBe(
      attention.id,
    );
    expect(dismissPreviewRepairIncident(attention.id)).toBe(true);
    expect(latestPreviewIncident({ localDate: "2026-07-18" })).toBeNull();
  });

  it("rejects Undo after a later schedule version", () => {
    const task = item({
      id: "task",
      title: "Task",
      startAt: at(8),
      endAt: at(9),
      latestEnd: at(12),
    });
    expect(replaceDemoCalendarItems([task], getDemoScheduleVersion())).toBe(
      true,
    );
    const incident = applyPreviewAutomaticRepair(
      { trigger: "fix_day", delayMinutes: 15, now: new Date(at(7)) },
      "Repair",
      "repair:one",
      "2026-07-18",
    )!;
    expect(
      replaceDemoCalendarItems(
        getDemoCalendarItems(),
        getDemoScheduleVersion(),
      ),
    ).toBe(true);
    expect(() => undoPreviewAutomaticRepair(incident.id)).toThrow(
      /schedule changed/i,
    );
  });
});
