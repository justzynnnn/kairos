import type { CalendarItem, Preference } from "@/lib/types";
import type {
  ProposalItem,
  SchedulingAction,
  SchedulingIntent,
} from "@/lib/scheduling/schema";
type Interval = { start: number; end: number; title: string };
const GRID = 15 * 60000,
  HORIZON = 7 * 86400000;
export class SchedulingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingValidationError";
  }
}
function ms(v: string | null, label: string) {
  if (!v) return null;
  const n = new Date(v).getTime();
  if (!Number.isFinite(n))
    throw new SchedulingValidationError(`${label} is invalid.`);
  return n;
}
function conflict(start: number, end: number, list: Interval[]) {
  return list.find((x) => start < x.end && end > x.start);
}
function occupied(items: CalendarItem[]): Interval[] {
  return items.flatMap((i) =>
    i.startAt && i.endAt && i.status !== "cancelled"
      ? [
          {
            start: new Date(i.startAt).getTime(),
            end: new Date(i.endAt).getTime(),
            title: i.title,
          },
        ]
      : [],
  );
}
function slot(list: Interval[], from: number, to: number, duration: number) {
  for (
    let t = Math.ceil(from / GRID) * GRID;
    t + duration * 60000 <= to;
    t += GRID
  )
    if (!conflict(t, t + duration * 60000, list)) return t;
  return null;
}
function pref(action: SchedulingAction, prefs: Preference[]) {
  return prefs.find(
    (p) => p.category.toLowerCase() === action.category.toLowerCase(),
  );
}
function base(a: SchedulingAction, i: number, p?: Preference): ProposalItem {
  const d =
    a.duration_minutes ??
    p?.defaultDurationMinutes ??
    (a.kind === "task" ? 60 : null);
  return {
    clientId: `proposed-${i + 1}`,
    type: a.kind,
    title: a.title,
    category: a.category,
    locationLabel: a.location_label,
    startAt: null,
    endAt: null,
    dueAt: a.due_at,
    timezone: "Asia/Manila",
    priority: a.priority,
    flexibility: p?.flexibility ?? a.flexibility,
    earliestStart: null,
    latestEnd: null,
    normalDurationMinutes: d,
    minimumDurationMinutes: d,
    minimumChunkMinutes:
      a.kind === "preparation"
        ? Math.min(a.session_length_minutes ?? 30, 60)
        : null,
    canShorten: p?.canShorten ?? a.can_shorten,
    canSplit: p?.canSplit ?? a.can_split,
    canSkip: p?.canSkip ?? a.can_skip,
    reminderMinutes: a.reminder_minutes,
    assumptions: [...a.assumptions],
  };
}
export function buildScheduleProposal(
  intent: SchedulingIntent,
  existing: CalendarItem[],
  preferences: Preference[] = [],
  now = new Date(),
) {
  if (intent.ambiguity)
    throw new SchedulingValidationError(
      intent.essential_question ?? "More detail is required.",
    );
  const busy = occupied(existing),
    out: ProposalItem[] = [];
  const byTitle = new Map<string, ProposalItem>();
  for (const [ai, a] of intent.actions.entries()) {
    const p = pref(a, preferences);
    if (a.kind === "deadline") {
      const due = ms(a.due_at, `${a.title} deadline`);
      if (!due || due <= now.getTime())
        throw new SchedulingValidationError(
          `${a.title} must have a future deadline.`,
        );
      const x = base(a, out.length, p);
      out.push(x);
      byTitle.set(a.title.toLowerCase(), x);
      continue;
    }
    const total =
      a.total_effort_minutes ??
      a.duration_minutes ??
      p?.defaultDurationMinutes ??
      60;
    const session =
      a.session_length_minutes ??
      a.duration_minutes ??
      p?.defaultDurationMinutes ??
      60;
    const count =
      a.kind === "preparation"
        ? (a.block_count ?? Math.ceil(total / session))
        : 1;
    let remain = total;
    for (let si = 0; si < count && remain > 0; si++) {
      const d = Math.min(session, remain),
        x = base(a, out.length, p);
      x.clientId = `proposed-${ai + 1}-${si + 1}`;
      x.title = count > 1 ? `${a.title} · Session ${si + 1}` : a.title;
      x.normalDurationMinutes = d;
      x.minimumDurationMinutes = d;
      let start = si === 0 ? ms(a.start_at, `${a.title} start`) : null;
      let end = si === 0 ? ms(a.end_at, `${a.title} end`) : null;
      if (start !== null && end === null) end = start + d * 60000;
      let earliest = now.getTime();
      if (a.after_title) {
        const dep =
          byTitle.get(a.after_title.toLowerCase()) ??
          out.find((y) =>
            y.title.toLowerCase().includes(a.after_title!.toLowerCase()),
          );
        const old = existing.find((y) =>
          y.title.toLowerCase().includes(a.after_title!.toLowerCase()),
        );
        earliest = Math.max(
          earliest,
          dep?.endAt
            ? new Date(dep.endAt).getTime()
            : old?.endAt
              ? new Date(old.endAt).getTime()
              : earliest,
        );
      }
      const deadline = intent.actions.find(
        (y) =>
          y.kind === "deadline" &&
          (!a.related_deadline_title ||
            y.title
              .toLowerCase()
              .includes(a.related_deadline_title.toLowerCase())),
      );
      const latest = deadline?.due_at
        ? new Date(deadline.due_at).getTime()
        : now.getTime() + HORIZON;
      if (start === null) {
        start = slot(busy, earliest, latest, d);
        if (start === null)
          throw new SchedulingValidationError(
            `No open ${d}-minute slot is available for ${a.title}.`,
          );
        end = start + d * 60000;
        x.assumptions.push("Placed in the first valid 15-minute slot.");
      }
      if (end === null || end <= start)
        throw new SchedulingValidationError(
          `${a.title} must end after it starts.`,
        );
      if (start < earliest && a.after_title)
        throw new SchedulingValidationError(
          `${a.title} must start after ${a.after_title}.`,
        );
      if (end > latest)
        throw new SchedulingValidationError(
          `${a.title} would extend past its deadline.`,
        );
      const c = conflict(start, end, busy);
      if (c)
        throw new SchedulingValidationError(
          `${a.title} conflicts with ${c.title}.`,
        );
      x.startAt = new Date(start).toISOString();
      x.endAt = new Date(end).toISOString();
      x.earliestStart =
        a.kind === "event" ? null : new Date(earliest).toISOString();
      x.latestEnd = a.kind === "event" ? null : new Date(latest).toISOString();
      busy.push({ start, end, title: x.title });
      out.push(x);
      byTitle.set(a.title.toLowerCase(), x);
      remain -= d;
    }
    if (remain > 0)
      throw new SchedulingValidationError(`${a.title} needs more sessions.`);
  }
  validateProposalItems(out, existing);
  return out;
}
export function validateProposalItems(
  items: ProposalItem[],
  existing: CalendarItem[] = [],
) {
  const busy = occupied(existing),
    proposed: Interval[] = [];
  for (const i of items) {
    if (i.type === "deadline") {
      if (!ms(i.dueAt, `${i.title} deadline`) || i.startAt || i.endAt)
        throw new SchedulingValidationError(
          "A deadline needs only a due date.",
        );
      continue;
    }
    const s = ms(i.startAt, `${i.title} start`),
      e = ms(i.endAt, `${i.title} end`);
    if (!s || !e || e <= s)
      throw new SchedulingValidationError(
        `${i.title} needs a valid start and end.`,
      );
    if (i.latestEnd && e > new Date(i.latestEnd).getTime())
      throw new SchedulingValidationError(
        `${i.title} extends past its deadline.`,
      );
    if (i.minimumDurationMinutes && (e - s) / 60000 < i.minimumDurationMinutes)
      throw new SchedulingValidationError(`${i.title} is too short.`);
    const c = conflict(s, e, [...busy, ...proposed]);
    if (c)
      throw new SchedulingValidationError(
        `${i.title} conflicts with ${c.title}.`,
      );
    proposed.push({ start: s, end: e, title: i.title });
  }
  return true;
}
