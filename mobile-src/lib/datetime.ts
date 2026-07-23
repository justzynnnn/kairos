// Intl.DateTimeFormat construction is expensive and these screens format the
// same shapes hundreds of times per render (a 28-day heatmap over the whole
// calendar, a full day's timeline). Formatters are pure for a given
// locale/timezone/options, so they are built once and reused.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = locale + "|" + JSON.stringify(options);
  let value = formatters.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, value);
  }
  return value;
}

/** Calendar day in the viewer's timezone, sortable and comparable as a string. */
export function dayKey(date: Date, timezone: string) {
  return formatter("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function sameDayInZone(
  value: string | null,
  timezone: string,
  date: Date,
) {
  if (!value) return false;
  return dayKey(new Date(value), timezone) === dayKey(date, timezone);
}

export function clockTime(date: Date, timezone: string) {
  return formatter("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Minutes since midnight in the viewer's timezone. */
export function minutesIntoDay(date: Date, timezone: string) {
  const parts = formatter("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}

export function hourOfDay(date: Date, timezone: string) {
  return Number(
    formatter("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

export function longDate(date: Date, timezone: string) {
  return formatter("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}
