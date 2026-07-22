import type { CalendarItem } from "@/lib/types";

const DEFAULT_TIMEZONE = "Asia/Manila";

function dateParts(value: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
}

export function formatTime(value: string | null, timeZone = DEFAULT_TIMEZONE) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }).format(new Date(value))
    : "";
}

export function formatDate(value: string | null, timeZone = DEFAULT_TIMEZONE) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone,
      }).format(new Date(value))
    : "";
}

export function formatLongDate(
  value: string | null,
  timeZone = DEFAULT_TIMEZONE,
) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(value))
    : "";
}

export function localDateKey(
  value: string | Date,
  timeZone = DEFAULT_TIMEZONE,
) {
  const parts = dateParts(
    typeof value === "string" ? new Date(value) : value,
    timeZone,
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isSameLocalDay(
  value: string | null,
  date: Date,
  timeZone = DEFAULT_TIMEZONE,
) {
  return (
    Boolean(value) &&
    localDateKey(value!, timeZone) === localDateKey(date, timeZone)
  );
}

export function toDateTimeLocal(
  value: string | null,
  timeZone = DEFAULT_TIMEZONE,
) {
  if (!value) return "";
  const parts = dateParts(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Converts an HTML datetime-local value in an IANA timezone to an instant. The
// short correction loop accounts for non-whole-hour offsets and DST changes
// without treating the browser's timezone as the user's timezone.
export function fromDateTimeLocal(value: string, timeZone = DEFAULT_TIMEZONE) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = dateParts(new Date(instant), timeZone);
    const renderedUtc = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
      Number(rendered.minute),
    );
    instant += target - renderedUtc;
  }
  return new Date(instant).toISOString();
}

export function greetingFor(timeZone: string, now = new Date()) {
  const hour = Number(dateParts(now, timeZone).hour);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function durationLabel(item: CalendarItem) {
  if (!item.startAt || !item.endAt) return null;
  const minutes = Math.round(
    (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) /
      60_000,
  );
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
