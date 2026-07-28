import type {
  CommandHint,
  DeadlinePreparation,
  SchedulingAction,
  SchedulingIntent,
} from "@/lib/scheduling/schema";

/**
 * The deterministic tier. It runs when Apple Intelligence is unavailable or
 * declines, so it is the only thing standing between the user and "nothing
 * happened" — which makes breadth more valuable here than cleverness.
 *
 * It works in two passes: split the command into clauses, then parse each
 * clause independently against one general grammar. The earlier version
 * matched four hand-written patterns against the *whole* string, so a compound
 * request like "Circuits 1 at 9-11:30am, lunch at 12 to 1pm, gym at 1:30 to
 * 3pm" produced a single item — the first pattern that happened to hit.
 */

const DEFAULT_TIMEZONE = "Asia/Manila";

const days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:am|pm)?`;
const DAY = String.raw`today|tonight|tomorrow|(?:on\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;
const COUNT = String.raw`\d+|a|an|one|two|three|four|five|six|half`;
const UNIT = String.raw`minutes?|mins?|hours?|hrs?`;

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timezone: string) {
  let value = zoneFormatters.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hourCycle: "h23",
    });
    zoneFormatters.set(timezone, value);
  }
  return value;
}

function zoneParts(instant: Date, timezone: string) {
  return Object.fromEntries(
    zoneFormatter(timezone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
}

/** Minutes the zone is ahead of UTC at this instant, DST included. */
function zoneOffsetMinutes(instant: Date, timezone: string) {
  const p = zoneParts(instant, timezone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * A wall-clock reading in `timezone` resolved to a real instant. The offset is
 * measured at the guessed instant and then re-measured at the corrected one, so
 * a reading that lands near a DST transition settles on the right side of it.
 */
function instantFromWall(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let time = wall - zoneOffsetMinutes(new Date(wall), timezone) * 60_000;
  time = wall - zoneOffsetMinutes(new Date(time), timezone) * 60_000;
  return time;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** ISO 8601 carrying the zone's own offset, so the reading stays legible. */
function isoInZone(time: number, timezone: string) {
  const offset = zoneOffsetMinutes(new Date(time), timezone);
  const p = zoneParts(new Date(time), timezone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function dayOffset(token: string | undefined, now: Date, timezone: string) {
  if (!token || /today|tonight/i.test(token)) return 0;
  if (/tomorrow/i.test(token)) return 1;
  const current = days.indexOf(zoneParts(now, timezone).weekday.toLowerCase());
  const wanted = days.findIndex((day) => token.toLowerCase().includes(day));
  if (wanted < 0) return 0;
  const ahead = (wanted - current + 7) % 7 || 7;
  return /next\s/i.test(token) && ahead < 7 ? ahead + 7 : ahead;
}

function clock(value: string) {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return hour < 24 && minute < 60 ? { h: hour, min: minute } : null;
}

function meridiem(value: string) {
  return /(am|pm)/i.exec(value)?.[1]?.toLowerCase();
}

function minutesOf(value: { h: number; min: number }) {
  return value.h * 60 + value.min;
}

/**
 * "at 3" almost always means the afternoon in a planner. Applied only when the
 * speaker gave no meridiem at all, so an explicit "3am" is never second-guessed.
 */
function assumeAfternoon(value: { h: number; min: number }) {
  return value.h >= 1 && value.h <= 6
    ? { h: value.h + 12, min: value.min }
    : value;
}

/**
 * "9-11:30am" and "12 to 1pm" state the meridiem once, at the end. Carrying it
 * leftward is only safe when it keeps the range ordered, so "11pm to 1am" is
 * left alone for the caller's midnight handling.
 */
function clockRange(startText: string, endText: string) {
  const start = clock(startText);
  const end = clock(endText);
  if (!start || !end) return null;
  const endMeridiem = meridiem(endText);
  if (!meridiem(startText)) {
    if (endMeridiem) {
      const carried = clock(startText.trim() + endMeridiem);
      if (carried && minutesOf(carried) < minutesOf(end))
        return { start: carried, end };
    } else {
      const both = { start: assumeAfternoon(start), end: assumeAfternoon(end) };
      if (minutesOf(both.start) < minutesOf(both.end)) return both;
    }
  }
  return { start, end };
}

function titleCase(value: string) {
  return value
    .replace(
      /^(?:and\s+|then\s+)?(?:(?:add|schedule|put|set|create|book)\s+)?(?:(?:up|in)\s+)?(?:my\s+|the\s+|a\s+|an\s+)?/i,
      "",
    )
    .replace(/\s+(?:for|at|from|on)$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      /^[0-9]/.test(word)
        ? word
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function durationMinutes(
  count: string | undefined,
  unit: string | undefined,
  fallback = 60,
) {
  if (!count) return fallback;
  const words: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    half: 0.5,
  };
  const value = Number(count) || words[count.toLowerCase()] || fallback;
  const minutes = /hour|hr/i.test(unit ?? "") ? value * 60 : value;
  return Math.max(5, Math.round(minutes));
}

const categoryRules: Array<[RegExp, string]> = [
  [/\b(class|lecture|lab|seminar|circuits?)\b/i, "Class"],
  [/\b(gym|workout|work\s?out|run|jog|training|exercise)\b/i, "Fitness"],
  [/\b(lunch|dinner|breakfast|merienda|brunch|kain)\b/i, "Meal"],
  [/\b(meeting|standup|stand-up|sync|call|interview)\b/i, "Meeting"],
  [/\b(appointment|doctor|dentist|clinic|checkup)\b/i, "Appointment"],
  [/\b(study|review|research|reading|revision|paper|thesis)\b/i, "Study"],
];

function categorize(title: string, kind: SchedulingAction["kind"]) {
  if (kind === "deadline") return "Deadline";
  if (kind === "preparation") return "Preparation";
  return (
    categoryRules.find(([pattern]) => pattern.test(title))?.[1] ?? "Personal"
  );
}

function make(
  value: Partial<SchedulingAction> &
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
      value.kind === "event" || value.kind === "deadline"
        ? "fixed"
        : "flexible",
    can_shorten: false,
    can_split: value.kind === "preparation",
    can_skip: false,
    priority: value.kind === "deadline" ? 5 : value.kind === "task" ? 3 : 4,
    reminder_minutes: 10,
    assumptions: [],
    ...value,
  };
}

/**
 * Shorthand a Filipino speaker actually types, plus the punctuation variants
 * that would otherwise break clause splitting or time parsing.
 */
function normalize(command: string) {
  return command
    .replace(/[–—]/g, "-")
    .replace(/\b(\d{1,2})\s*nn\b/gi, "$1pm")
    .replace(/\b(\d{1,2})\s*mn\b/gi, "$1am")
    .replace(/\ba\.m\.?/gi, "am")
    .replace(/\bp\.m\.?/gi, "pm")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One clause per schedule item. Splitting on " and " costs the occasional title
 * ("Rock and Roll"), which is the right trade for a tier whose failure mode is
 * silently dropping the rest of the sentence.
 */
function clauses(command: string) {
  return command
    .split(/\s*[,;]\s*|\s*\.\s+|\s+(?:and|then|plus|tapos|sabay)\s+/i)
    .map((clause) =>
      clause
        .trim()
        .replace(/[.\s]+$/, "")
        .trim(),
    )
    .filter((clause) => clause.length > 1);
}

type ParseContext = {
  now: Date;
  timezone: string;
  offset: number;
  placed: SchedulingAction[];
  deadlineTitle: string | null;
};

function resolveDay(clause: string, context: ParseContext) {
  const match = clause.match(new RegExp(String.raw`\b(${DAY})\b`, "i"));
  if (!match) return { text: clause, offset: context.offset, explicit: false };
  context.offset = dayOffset(match[0], context.now, context.timezone);
  return {
    text: clause.replace(match[0], " ").replace(/\s+/g, " ").trim(),
    offset: context.offset,
    explicit: true,
  };
}

function stamp(
  context: ParseContext,
  offset: number,
  time: { h: number; min: number },
) {
  const p = zoneParts(context.now, context.timezone);
  return instantFromWall(
    Number(p.year),
    Number(p.month),
    Number(p.day) + offset,
    time.h,
    time.min,
    context.timezone,
  );
}

/**
 * A trailing "at <place>" / "in <place>". The lookahead is what separates a
 * place from a time: "at 4pm" is when, "at Makati Medical Center" is where, and
 * only the latter can follow a duration.
 */
function extractLocation(text: string) {
  const match = text.match(/\s+(?:at|in)\s+((?!\d)[^,;]+?)\s*$/i);
  if (!match) return { text, location: null as string | null };
  return {
    text: text.slice(0, match.index).trim(),
    location: match[1].trim(),
  };
}

/** "gym after class" — the dependency the engine will resolve by title. */
function extractAfter(text: string, context: ParseContext) {
  const match = text.match(/\s+after\s+(?:the\s+|my\s+)?(.+?)$/i);
  if (!match) return { text, after: null as string | null };
  const wanted = match[1].trim().toLowerCase();
  const known = context.placed.find(
    (action) =>
      action.kind !== "deadline" &&
      (action.title.toLowerCase().includes(wanted) ||
        action.category.toLowerCase() === wanted),
  );
  return {
    text: text.slice(0, match.index).trim(),
    after: known?.title ?? match[1].trim(),
  };
}

function parseClause(
  clause: string,
  context: ParseContext,
): SchedulingAction | null {
  // Deadlines first: "due" pins the meaning of the whole clause, and its time
  // is a due date rather than a start.
  const deadline = clause.match(
    new RegExp(
      String.raw`^(.+?)\s+(?:is\s+|are\s+)?due\s*(?:${DAY})?\s*(?:at\s+(${TIME}))?$`,
      "i",
    ),
  );
  if (deadline) {
    const day = resolveDay(clause, context);
    const time = clock(deadline[2] ?? "") ?? { h: 17, min: 0 };
    const title = titleCase(deadline[1]);
    if (title)
      return make({
        kind: "deadline",
        title: `${title} Due`,
        category: "Deadline",
        due_at: isoInZone(stamp(context, day.offset, time), context.timezone),
        assumptions: deadline[2]
          ? []
          : ["Used 5:00 PM because no deadline time was given."],
      });
  }

  // "Block 90 minutes for research" — effort to place, not a fixed appointment.
  const block = clause.match(
    new RegExp(
      String.raw`^(?:block|reserve|set\s+aside)\s+(${COUNT})\s*(${UNIT})\s+(?:for\s+)?(.+)$`,
      "i",
    ),
  );
  if (block) {
    const total = durationMinutes(block[1], block[2]);
    const previous = [...context.placed]
      .reverse()
      .find((action) => action.kind !== "deadline");
    return make({
      kind: "preparation",
      title: titleCase(block[3]),
      category: "Preparation",
      total_effort_minutes: total,
      session_length_minutes: total,
      block_count: 1,
      related_deadline_title: context.deadlineTitle,
      after_title: previous?.title ?? null,
      can_split: true,
      assumptions: [
        "Movable and splittable, but not shortenable or skippable.",
      ],
    });
  }

  const day = resolveDay(clause, context);
  const dependency = extractAfter(day.text, context);
  const placed = extractLocation(dependency.text);
  const text = placed.text;
  const location = placed.location;

  // "Circuits 1 at 9-11:30am" / "lunch from 12 to 1pm"
  const range = text.match(
    new RegExp(
      String.raw`^(.+?)\s*(?:from|at|@|,)?\s*(${TIME})\s*(?:-|to|until|til|till)\s*(${TIME})$`,
      "i",
    ),
  );
  if (range) {
    const pair = clockRange(range[2], range[3]);
    const title = titleCase(range[1]);
    if (pair && title) {
      let endOffset = day.offset;
      const start = stamp(context, day.offset, pair.start);
      if (stamp(context, day.offset, pair.end) <= start) endOffset += 1;
      const end = stamp(context, endOffset, pair.end);
      const rolled = rollForward(start, end, day.explicit, context);
      return make({
        kind: "event",
        title,
        category: categorize(title, "event"),
        location_label: location,
        start_at: isoInZone(rolled.start, context.timezone),
        end_at: isoInZone(rolled.end, context.timezone),
        duration_minutes: Math.round((end - start) / 60_000),
        after_title: dependency.after,
        assumptions: rolled.assumptions,
      });
    }
  }

  // "gym at 9am", optionally "for 45 minutes"
  const single = text.match(
    new RegExp(
      String.raw`^(.+?)\s+(?:from|at|@)\s*(${TIME})(?:\s+for\s+(${COUNT})\s*(${UNIT}))?$`,
      "i",
    ),
  );
  if (single) {
    const parsed = clock(single[2]);
    const title = titleCase(single[1]);
    if (parsed && title) {
      const time = meridiem(single[2]) ? parsed : assumeAfternoon(parsed);
      const minutes = durationMinutes(single[3], single[4]);
      const start = stamp(context, day.offset, time);
      const rolled = rollForward(
        start,
        start + minutes * 60_000,
        day.explicit,
        context,
      );
      return make({
        kind: "event",
        title,
        category: categorize(title, "event"),
        location_label: location,
        start_at: isoInZone(rolled.start, context.timezone),
        end_at: isoInZone(rolled.end, context.timezone),
        duration_minutes: minutes,
        after_title: dependency.after,
        assumptions: [
          ...rolled.assumptions,
          ...(single[3]
            ? []
            : ["Used a 60-minute duration because none was provided."]),
        ],
      });
    }
  }

  // "gym for an hour" — a duration with no time is work to fit in, not an event.
  const loose = text.match(
    new RegExp(String.raw`^(.+?)\s+for\s+(${COUNT})\s*(${UNIT})$`, "i"),
  );
  if (loose) {
    const title = titleCase(loose[1]);
    if (title)
      return make({
        kind: "task",
        title: sessionName(title),
        category: categorize(title, "task"),
        location_label: location,
        duration_minutes: durationMinutes(loose[2], loose[3]),
        after_title: dependency.after,
        assumptions: dependency.after
          ? [`Placed after ${dependency.after} without moving it.`]
          : [],
      });
  }

  // A bare "gym after class" still carries a real instruction.
  if (dependency.after && text.trim()) {
    const title = titleCase(text);
    if (title)
      return make({
        kind: "task",
        title: sessionName(title),
        category: categorize(title, "task"),
        duration_minutes: 60,
        after_title: dependency.after,
        assumptions: [
          `Placed after ${dependency.after} without moving it.`,
          "Used a 60-minute duration because none was provided.",
        ],
      });
  }

  /*
   * Last resort: a clause with no time, no duration and no dependency, but
   * which names something this parser recognises as an activity. "Plan gym
   * three times next week" states a real intention that the tiers above cannot
   * pin down, and a flexible task the engine will fit into a free slot serves
   * the user better than dropping the sentence.
   *
   * Gated on the category vocabulary on purpose: unrecognised text still
   * returns null, so genuinely unparseable input reaches the clarifying
   * question instead of becoming an invented item.
   */
  const known = categoryRules.find(([pattern]) => pattern.test(text));
  if (known && text.trim().length <= 80) {
    const keyword = text.match(known[0])?.[0] ?? text;
    return make({
      kind: "task",
      title: sessionName(titleCase(keyword)),
      category: known[1],
      duration_minutes: 60,
      assumptions: [
        "No time was given, so this is flexible work to fit into a free slot.",
        "Used a 60-minute duration because none was provided.",
      ],
    });
  }

  return null;
}

/**
 * An untimed activity is a block of effort rather than a named appointment, and
 * reads better labelled as one. Only applied to the bare keyword: "Gym" becomes
 * "Gym Session", but "Gym With Ana" is left as the user said it.
 */
function sessionName(title: string) {
  return /^(gym|workout|run|study|review|training|exercise)$/i.test(title)
    ? `${title} Session`
    : title;
}

/**
 * A time of day with no date, already past, means the next one. Only applied
 * when the speaker named no day — "gym at 9am" at 2pm is tomorrow's gym, but
 * "gym today at 9am" is a deliberate backfill.
 */
function rollForward(
  start: number,
  end: number,
  explicitDay: boolean,
  context: ParseContext,
) {
  if (explicitDay || start >= context.now.getTime())
    return { start, end, assumptions: [] as string[] };
  const day = 86_400_000;
  return {
    start: start + day,
    end: end + day,
    assumptions: ["Used tomorrow because that time has already passed today."],
  };
}

export function deterministicInterpret(
  command: string,
  now = new Date(),
  prep?: DeadlinePreparation,
  timezone = DEFAULT_TIMEZONE,
): SchedulingIntent | null {
  const context: ParseContext = {
    now,
    timezone,
    offset: 0,
    placed: [],
    deadlineTitle: null,
  };
  for (const clause of clauses(normalize(command))) {
    const action = parseClause(clause, context);
    if (!action) continue;
    if (action.kind === "deadline") {
      context.deadlineTitle = action.title;
      // A preparation clause parsed before its deadline still belongs to it.
      context.placed.forEach((placed) => {
        if (placed.kind === "preparation" && !placed.related_deadline_title)
          placed.related_deadline_title = action.title;
      });
    }
    context.placed.push(action);
  }

  const actions = context.placed;
  const deadlineTitle = context.deadlineTitle;

  if (
    deadlineTitle &&
    prep &&
    !actions.some((action) => action.kind === "preparation")
  ) {
    const session =
      prep.mode === "one"
        ? prep.totalEffortMinutes
        : Math.min(prep.sessionLengthMinutes, prep.totalEffortMinutes);
    actions.push(
      make({
        kind: "preparation",
        title: deadlineTitle.replace(/ Due$/, " Preparation"),
        category: "Preparation",
        total_effort_minutes: prep.totalEffortMinutes,
        session_length_minutes: session,
        block_count: Math.ceil(prep.totalEffortMinutes / session),
        related_deadline_title: deadlineTitle,
        can_split: true,
      }),
    );
  }

  if (!actions.length) return null;
  const needs = Boolean(
    deadlineTitle && !actions.some((action) => action.kind === "preparation"),
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
    actions: actions.slice(0, 20),
  };
}

// Expands an on-device model's few fields into a schema-conforming intent.
// Every timestamp and every flexibility rule is computed here rather than by
// the model, so a hallucinated field cannot reach the engine. Returns null when
// the hint is too thin to be safe, which sends the caller back to the normal
// interpretation path.
export function interpretFromHint(
  hint: CommandHint,
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): SchedulingIntent | null {
  const context: ParseContext = {
    now,
    timezone,
    offset: 0,
    placed: [],
    deadlineTitle: null,
  };
  const when = normalize(hint.when ?? "");
  const timeToken = when.match(new RegExp(TIME, "i"))?.[0];
  const parsed = timeToken ? clock(timeToken) : null;
  const start = parsed
    ? stamp(
        context,
        dayOffset(when.replace(timeToken!, ""), now, timezone),
        meridiem(timeToken!) ? parsed : assumeAfternoon(parsed),
      )
    : null;
  // An event with no resolvable time would be guesswork, so defer instead.
  if (hint.kind === "event" && start === null) return null;
  const duration = hint.duration_minutes;
  const assumptions = ["Interpreted on this device by Apple Intelligence."];
  if (!duration && hint.kind !== "deadline")
    assumptions.push("Used a 60-minute duration because none was provided.");
  const iso = start === null ? null : isoInZone(start, timezone);
  return {
    summary: `Create 1 schedule item.`,
    ambiguity: false,
    follow_up_kind: "none",
    essential_question: null,
    assumptions,
    external_send_authorized: false,
    actions: [
      make({
        kind: hint.kind,
        title: titleCase(hint.title),
        category: hint.category,
        start_at: hint.kind === "deadline" ? null : iso,
        due_at: hint.kind === "deadline" ? iso : null,
        end_at:
          hint.kind === "event" && start !== null
            ? isoInZone(start + (duration ?? 60) * 60_000, timezone)
            : null,
        duration_minutes: hint.kind === "deadline" ? null : (duration ?? 60),
      }),
    ],
  };
}
