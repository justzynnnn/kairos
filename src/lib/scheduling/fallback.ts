import type {
  DeadlinePreparation,
  SchedulingAction,
  SchedulingIntent,
} from "@/lib/scheduling/schema";
const days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
function parts(now: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
}
function offset(token: string | undefined, now: Date) {
  if (!token || /today/i.test(token)) return 0;
  if (/tomorrow/i.test(token)) return 1;
  const p = parts(now),
    want = days.findIndex((d) => token.toLowerCase().includes(d)),
    cur = days.indexOf(p.weekday.toLowerCase());
  return want < 0 ? 0 : (want - cur + 7) % 7 || 7;
}
function clock(v: string) {
  const m = v
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? { h, min } : null;
}
function at(now: Date, o: number, c: { h: number; min: number }) {
  const p = parts(now),
    d = new Date(
      Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + o),
    );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(c.h).padStart(2, "0")}:${String(c.min).padStart(2, "0")}:00+08:00`;
}
function title(v: string) {
  return v
    .replace(/^(?:and\s+)?(?:(?:add|schedule)\s+)?(?:my\s+)?/i, "")
    .trim()
    .split(/\s+/)
    .map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase())
    .join(" ");
}
function mins(n: string | undefined, u: string | undefined, def = 60) {
  if (!n) return def;
  const w: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };
  const x = Number(n) || w[n.toLowerCase()] || def;
  return /hour|hr/i.test(u ?? "") ? x * 60 : x;
}
function make(
  p: Partial<SchedulingAction> &
    Pick<SchedulingAction, "kind" | "title" | "category">,
): SchedulingAction {
  return {
    location_label: null,
    start_at: null,
    end_at: null,
    due_at: null,
    duration_minutes: null,
    total_effort_minutes: null,
    session_length_minutes: null,
    block_count: null,
    after_title: null,
    related_deadline_title: null,
    flexibility:
      p.kind === "event" || p.kind === "deadline" ? "fixed" : "flexible",
    can_shorten: false,
    can_split: p.kind === "preparation",
    can_skip: false,
    priority: p.kind === "deadline" ? 5 : p.kind === "task" ? 3 : 4,
    reminder_minutes: 10,
    assumptions: [],
    ...p,
  };
}
export function deterministicInterpret(
  command: string,
  now = new Date(),
  prep?: DeadlinePreparation,
): SchedulingIntent | null {
  const actions: SchedulingAction[] = [];
  const cm = command.match(
    /(?:add|schedule)?\s*(?:my\s+)?([a-z0-9 ]*class)\s+(today|tomorrow|(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))?\s*(?:from|at)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (cm) {
    const s = clock(cm[3]),
      e = clock(cm[4]),
      o = offset(cm[2], now);
    if (s && e) {
      let endOffset = o;
      const si = at(now, o, s),
        ei0 = at(now, o, e);
      if (new Date(ei0) <= new Date(si)) endOffset++;
      const ei = at(now, endOffset, e);
      actions.push(
        make({
          kind: "event",
          title: title(cm[1]),
          category: "Class",
          start_at: si,
          end_at: ei,
          duration_minutes:
            (new Date(ei).getTime() - new Date(si).getTime()) / 60000,
        }),
      );
    }
  }
  if (/\bgym\b/i.test(command)) {
    const gm = command.match(
        /gym(?:\s+session)?(?:\s+after\s+(?:the\s+)?([a-z ]+?))?(?:\s+for\s+(\d+|a|an|one|two|three)\s*(minutes?|hours?|hrs?))?(?=,|\.|;|\s+and\s+(?:my|the)|$)/i,
      ),
      cl = actions.find((a) => a.category === "Class");
    actions.push(
      make({
        kind: "task",
        title: "Gym Session",
        category: "Fitness",
        duration_minutes: mins(gm?.[2], gm?.[3]),
        after_title: cl?.title ?? null,
        assumptions: ["Placed after class without moving it."],
      }),
    );
  }
  const dm = command.match(
    /(?:my\s+)?([a-z][a-z0-9 ]{1,60}?)\s+(?:is\s+)?due\s+(today|tomorrow|(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i,
  );
  let deadline: string | null = null;
  if (dm) {
    deadline = `${title(dm[1])} Due`;
    actions.push(
      make({
        kind: "deadline",
        title: deadline,
        category: "Deadline",
        due_at: at(
          now,
          offset(dm[2], now),
          clock(dm[3] ?? "5pm") ?? { h: 17, min: 0 },
        ),
        assumptions: dm[3]
          ? []
          : ["Used 5:00 PM because no deadline time was given."],
      }),
    );
  }
  const pm = command.match(
    /(?:block|schedule)\s+(\d+|a|an|one|two|three)\s*(minutes?|hours?|hrs?)\s+(?:for\s+)?([a-z][a-z0-9 ]+?)(?=,|\.|;|$)/i,
  );
  if (pm) {
    const total = mins(pm[1], pm[2]);
    actions.push(
      make({
        kind: "preparation",
        title: title(pm[3]),
        category: "Preparation",
        total_effort_minutes: total,
        session_length_minutes: total,
        block_count: 1,
        related_deadline_title: deadline,
        after_title:
          actions.find((a) => a.category === "Fitness")?.title ?? null,
        can_split: true,
        assumptions: [
          "Movable and splittable, but not shortenable or skippable.",
        ],
      }),
    );
  } else if (deadline && prep) {
    const session =
      prep.mode === "one"
        ? prep.totalEffortMinutes
        : Math.min(prep.sessionLengthMinutes, prep.totalEffortMinutes);
    actions.push(
      make({
        kind: "preparation",
        title: deadline.replace(/ Due$/, " Preparation"),
        category: "Preparation",
        total_effort_minutes: prep.totalEffortMinutes,
        session_length_minutes: session,
        block_count: Math.ceil(prep.totalEffortMinutes / session),
        related_deadline_title: deadline,
        can_split: true,
      }),
    );
  }
  if (!actions.length) {
    const generic = command.match(
      /(?:add|schedule)\s+(?:my\s+)?(.+?)\s+(today|tomorrow|(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+for\s+(\d+|a|an|one|two|three)\s*(minutes?|hours?|hrs?))?(?:\s+(?:at|in)\s+(.+))?$/i,
    );
    if (generic) {
      const startClock = clock(generic[3]),
        duration = mins(generic[4], generic[5]);
      if (startClock) {
        const start = at(now, offset(generic[2], now), startClock),
          end = new Date(
            new Date(start).getTime() + duration * 60000,
          ).toISOString();
        actions.push(
          make({
            kind: /appointment|meeting|class/i.test(generic[1])
              ? "event"
              : "task",
            title: title(generic[1]),
            category: /appointment/i.test(generic[1])
              ? "Appointment"
              : "Personal",
            location_label: generic[6]?.trim() ?? null,
            start_at: start,
            end_at: end,
            duration_minutes: duration,
            assumptions: generic[4]
              ? []
              : ["Used a 60-minute duration because none was provided."],
          }),
        );
      }
    }
  }
  if (!actions.length) return null;
  const needs = Boolean(
    deadline && !actions.some((a) => a.kind === "preparation"),
  );
  return {
    summary: `Create ${actions.length} schedule item${actions.length === 1 ? "" : "s"}.`,
    ambiguity: needs,
    follow_up_kind: needs ? "deadline_preparation" : "none",
    essential_question: needs
      ? "Should preparation use one block or multiple blocks, and how much total effort and time per session do you need?"
      : null,
    assumptions: [
      "Limited deterministic fallback was used; review every detail.",
    ],
    external_send_authorized: false,
    actions,
  };
}
