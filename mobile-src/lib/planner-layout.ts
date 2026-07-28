import type { CalendarItem } from "@/lib/types";
import { dayKey, minutesIntoDay } from "./datetime";

/**
 * Geometry for the planner's time grids, kept apart from the components that
 * draw them so Day and Week place an event by the same rules.
 *
 * Two things the previous version got wrong are fixed here. The canvas was a
 * fixed 960px over a hardcoded 06:00–23:00, so anything outside that window
 * rendered at a negative offset or past the bottom edge — invisible, with no
 * indication it existed. And nothing measured overlap, so simultaneous events
 * stacked exactly on top of each other and only the last one drawn could be
 * read or tapped.
 */

export const SNAP_MINUTES = 15;
export const PIXELS_PER_HOUR = 68;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 23;

export type PositionedItem = {
  item: CalendarItem;
  startMinutes: number;
  endMinutes: number;
  /** Index of the column this item occupies within its overlap cluster. */
  column: number;
  /** How many columns the cluster was split into. */
  columns: number;
};

export type DayLayout = {
  startMinute: number;
  endMinute: number;
  totalMinutes: number;
  height: number;
  hours: number[];
  items: PositionedItem[];
};

export function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function addDays(date: Date, count: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + count);
  return value;
}

/** Monday-first, matching the week the planner's column headers describe. */
export function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const weekday = (value.getDay() + 6) % 7;
  return addDays(value, -weekday);
}

export function startOfMonth(date: Date) {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
}

export function addMonths(date: Date, count: number) {
  const value = startOfMonth(date);
  value.setMonth(value.getMonth() + count);
  return value;
}

/** The six-week grid a month view draws, always Monday-first and always full. */
export function monthGrid(month: Date) {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function itemsOnDay(
  items: CalendarItem[],
  date: Date,
  timezone: string,
) {
  const key = dayKey(date, timezone);
  return items.filter((item) => {
    if (item.status === "cancelled") return false;
    const at = item.startAt ?? item.dueAt;
    return Boolean(at) && dayKey(new Date(at!), timezone) === key;
  });
}

/**
 * Splits a day's items into clusters of mutually overlapping events and gives
 * each one a column, so concurrent events sit side by side instead of on top of
 * one another. A cluster is widened only as far as it needs: two events that
 * overlap take half the width each, and an event alone keeps the full width.
 */
function assignColumns(
  entries: Array<{
    item: CalendarItem;
    startMinutes: number;
    endMinutes: number;
  }>,
): PositionedItem[] {
  const sorted = [...entries].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const positioned: PositionedItem[] = [];
  let cluster: PositionedItem[] = [];
  let clusterEnd = -1;

  const close = () => {
    const width = cluster.reduce(
      (most, entry) => Math.max(most, entry.column + 1),
      0,
    );
    cluster.forEach((entry) => {
      entry.columns = width;
    });
    cluster = [];
  };

  for (const entry of sorted) {
    if (entry.startMinutes >= clusterEnd && cluster.length) close();
    // The first column whose last event has already finished.
    const columnEnds: number[] = [];
    cluster.forEach((placed) => {
      columnEnds[placed.column] = Math.max(
        columnEnds[placed.column] ?? -1,
        placed.endMinutes,
      );
    });
    let column = 0;
    while ((columnEnds[column] ?? -1) > entry.startMinutes) column += 1;
    const value: PositionedItem = { ...entry, column, columns: 1 };
    cluster.push(value);
    positioned.push(value);
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
  }
  if (cluster.length) close();
  return positioned;
}

/**
 * The grid for one day. The window starts at the usual waking hours and then
 * stretches to contain whatever is actually scheduled, so a 05:00 flight or a
 * midnight deadline is drawn rather than clipped.
 */
export function layoutDay(
  items: CalendarItem[],
  date: Date,
  timezone: string,
): DayLayout {
  const entries = itemsOnDay(items, date, timezone)
    .filter((item) => item.startAt)
    .map((item) => {
      const startMinutes = minutesIntoDay(new Date(item.startAt!), timezone);
      const end = item.endAt
        ? minutesIntoDay(new Date(item.endAt), timezone)
        : startMinutes + 30;
      return {
        item,
        startMinutes,
        // An event running past midnight is clamped to the day it started in;
        // the following day draws its own remainder.
        endMinutes: Math.max(
          startMinutes + 15,
          end <= startMinutes ? 24 * 60 : end,
        ),
      };
    });

  const earliest = entries.reduce(
    (value, entry) => Math.min(value, Math.floor(entry.startMinutes / 60) * 60),
    DEFAULT_START_HOUR * 60,
  );
  const latest = entries.reduce(
    (value, entry) => Math.max(value, Math.ceil(entry.endMinutes / 60) * 60),
    DEFAULT_END_HOUR * 60,
  );
  const totalMinutes = Math.max(60, latest - earliest);
  return {
    startMinute: earliest,
    endMinute: latest,
    totalMinutes,
    height: (totalMinutes / 60) * PIXELS_PER_HOUR,
    hours: Array.from(
      { length: Math.floor(totalMinutes / 60) + 1 },
      (_, index) => earliest / 60 + index,
    ),
    items: assignColumns(entries),
  };
}

export function minutesToOffset(minutes: number, layout: DayLayout) {
  return ((minutes - layout.startMinute) / 60) * PIXELS_PER_HOUR;
}

export function offsetToMinutes(offset: number, layout: DayLayout) {
  return layout.startMinute + (offset / PIXELS_PER_HOUR) * 60;
}

export function snap(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/**
 * A wall-clock minute on `date`, read in `timezone`, as a real instant.
 *
 * Anchored on midday rather than midnight: noon is the furthest point from any
 * transition, so measuring the zone's offset there resolves the correct
 * calendar day even when the device's own zone differs from the viewer's.
 */
export function instantAt(date: Date, minutes: number, timezone: string) {
  const noon = new Date(startOfDay(date).getTime() + 12 * 3_600_000);
  const midnight = noon.getTime() - minutesIntoDay(noon, timezone) * 60_000;
  return new Date(midnight + minutes * 60_000);
}
