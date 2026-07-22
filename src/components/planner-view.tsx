"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { CalendarItemActions } from "@/components/calendar-item-actions";
import { CalendarItemCard } from "@/components/calendar-item-card";
import { JourneyMode } from "@/components/journey-mode";
import { RepairWorkspace as RepairWorkspacePanel } from "@/components/repair-workspace";
import { formatTime, localDateKey } from "@/lib/format";
import type { CalendarItem } from "@/lib/types";

type PlannerViewMode = "day" | "week";
type TimelineItem = {
  item: CalendarItem;
  startMinutes: number;
  endMinutes: number;
};

function timeGuideLabel(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const hour12 = hour % 12 || 12;
  return `${hour12} ${hour < 12 ? "AM" : "PM"}`;
}

function validDateKey(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function mondayOf(key: string) {
  const date = new Date(`${key}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(key, -offset);
}
function label(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}
function itemDate(item: CalendarItem, timezone: string) {
  const instant = item.type === "deadline" ? item.dueAt : item.startAt;
  return instant ? localDateKey(instant, timezone) : "";
}
function minutesInZone(timezone: string, value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}
function timelineItem(
  item: CalendarItem,
  timezone: string,
): TimelineItem | null {
  const startAt = item.startAt ?? item.dueAt;
  if (!startAt) return null;
  const startMinutes = minutesInZone(timezone, new Date(startAt));
  const durationMinutes = item.endAt
    ? Math.max(
        15,
        Math.round(
          (new Date(item.endAt).getTime() - new Date(startAt).getTime()) /
            60_000,
        ),
      )
    : 30;
  return {
    item,
    startMinutes,
    endMinutes: Math.min(24 * 60, startMinutes + durationMinutes),
  };
}
function plannerHref(
  nextView: PlannerViewMode,
  nextDate: string,
  itemId?: string,
) {
  const query = new URLSearchParams({ view: nextView, date: nextDate });
  if (itemId) query.set("item", itemId);
  return `/planner?${query.toString()}` as Route;
}

function RepairWorkspace({ items }: { items: CalendarItem[] }) {
  return (
    <details className="grouped-section">
      <summary className="cursor-pointer list-none font-display text-sm font-semibold text-[var(--navy)]">
        Manual schedule repair
      </summary>
      <div className="mt-4 border-t border-[var(--outline)] pt-4">
        <RepairWorkspacePanel items={items} />
      </div>
    </details>
  );
}

export function PlannerView({
  items,
  timezone,
}: {
  items: CalendarItem[];
  timezone: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const today = localDateKey(new Date(), timezone);
  const view: PlannerViewMode = params.get("view") === "week" ? "week" : "day";
  const selected = validDateKey(params.get("date")) ?? today;
  const start = view === "week" ? mondayOf(selected) : selected;
  const dates =
    view === "week"
      ? Array.from({ length: 7 }, (_, index) => addDays(start, index))
      : [selected];
  const visible = items.filter(
    (item) =>
      dates.includes(itemDate(item, timezone)) && item.status !== "cancelled",
  );
  const selectedItem = items.find((item) => item.id === params.get("item"));
  const detailClose = useRef<HTMLAnchorElement | null>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedItem) return;
    detailReturnFocus.current = document.activeElement as HTMLElement | null;
    detailClose.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        router.push(plannerHref(view, selected), { scroll: false });
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      detailReturnFocus.current?.focus();
    };
  }, [router, selected, selectedItem, view]);

  function navigate(nextView: PlannerViewMode, nextDate = selected) {
    router.push(plannerHref(nextView, nextDate), {
      scroll: false,
    });
  }

  function shift(direction: number) {
    navigate(view, addDays(selected, direction * (view === "week" ? 7 : 1)));
  }
  const rangeLabel =
    view === "week"
      ? `${label(dates[0], { month: "short", day: "numeric" })} – ${label(dates[6], { month: "short", day: "numeric", year: "numeric" })}`
      : label(selected, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
  const currentMinutes = minutesInZone(timezone);
  const dayItems = visible
    .sort((a, b) =>
      (a.startAt ?? a.dueAt ?? "").localeCompare(b.startAt ?? b.dueAt ?? ""),
    )
    .map((item) => timelineItem(item, timezone))
    .filter((item): item is TimelineItem => Boolean(item));
  const earliestItem = Math.min(
    6 * 60,
    ...dayItems.map((item) => Math.floor(item.startMinutes / 60) * 60),
  );
  const latestItem = Math.max(
    22 * 60,
    ...dayItems.map((item) => Math.ceil(item.endMinutes / 60) * 60),
  );
  const timelineMinutes = latestItem - earliestItem;
  const timeGuides = Array.from(
    { length: timelineMinutes / 60 + 1 },
    (_, index) => earliestItem + index * 60,
  );
  const showCurrentTime =
    selected === today &&
    currentMinutes >= earliestItem &&
    currentMinutes <= latestItem;

  return (
    <div className="page-stack planner-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Schedule workspace</p>
          <h1 className="page-title">Planner</h1>
          <p className="page-description" data-testid="planner-range">
            {rangeLabel} · {visible.length}{" "}
            {visible.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Link
          href={
            "/assistant?command=Create%20a%20new%20schedule%20item" as Route
          }
          className="btn btn-primary min-h-11 px-4 text-sm"
        >
          <Plus className="size-4" />
          Create item
        </Link>
      </header>
      <section className="planner-toolbar">
        <div
          className="segmented-control"
          role="group"
          aria-label="Planner view"
        >
          {(["day", "week"] as const).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={view === option}
              onClick={() => navigate(option, selected)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="planner-date-nav">
          <button
            type="button"
            aria-label={`Previous ${view}`}
            onClick={() => shift(-1)}
            className="icon-button"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => navigate(view, today)}
            className="btn btn-ghost min-h-10 px-3 text-sm"
          >
            {selected === today ? "Today" : "Return to today"}
          </button>
          <button
            type="button"
            aria-label={`Next ${view}`}
            onClick={() => shift(1)}
            className="icon-button"
          >
            <ChevronRight />
          </button>
        </div>
      </section>

      {view === "day" ? (
        <section className="day-calendar" data-testid="planner-grid">
          <header>
            <div>
              <p className="eyebrow">
                {selected === today
                  ? "Today"
                  : label(selected, { weekday: "long" })}
              </p>
              <h2 className="section-title">
                {label(selected, { month: "long", day: "numeric" })}
              </h2>
            </div>
          </header>
          <div
            className="day-timeline"
            aria-label="Hourly day timeline"
            data-testid="planner-time-guide"
          >
            <ol className="day-time-axis" aria-label="Time of day">
              {timeGuides.map((minutes) => (
                <li
                  key={minutes}
                  style={{
                    top: `${((minutes - earliestItem) / timelineMinutes) * 100}%`,
                  }}
                >
                  <time
                    dateTime={`${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`}
                  >
                    {timeGuideLabel(minutes)}
                  </time>
                </li>
              ))}
            </ol>
            <div
              className="day-timeline-surface"
              style={
                {
                  "--timeline-height": `${(timelineMinutes / 60) * 4.5}rem`,
                } as React.CSSProperties
              }
            >
              <div className="day-timeline-guides" aria-hidden>
                {timeGuides.map((minutes) => (
                  <span
                    key={minutes}
                    style={{
                      top: `${((minutes - earliestItem) / timelineMinutes) * 100}%`,
                    }}
                  />
                ))}
              </div>
              {showCurrentTime && (
                <div
                  className="current-time-marker"
                  style={
                    {
                      "--time-position": `${((currentMinutes - earliestItem) / timelineMinutes) * 100}%`,
                    } as React.CSSProperties
                  }
                >
                  <span>{formatTime(new Date().toISOString(), timezone)}</span>
                </div>
              )}
              {dayItems.length ? (
                dayItems.map(({ item, startMinutes, endMinutes }) => (
                  <div
                    key={item.id}
                    className="timeline-item"
                    style={
                      {
                        "--item-accent":
                          item.status === "completed"
                            ? "var(--success)"
                            : item.flexibility === "fixed"
                              ? "var(--navy)"
                              : item.flexibility === "protected"
                                ? "var(--gold)"
                                : "var(--cyan-deep)",
                        top: `${((startMinutes - earliestItem) / timelineMinutes) * 100}%`,
                        height: `${((endMinutes - startMinutes) / timelineMinutes) * 100}%`,
                      } as React.CSSProperties
                    }
                  >
                    <CalendarItemCard
                      item={item}
                      timezone={timezone}
                      detailsHref={plannerHref("day", selected, item.id)}
                    />
                  </div>
                ))
              ) : (
                <div className="empty-state day-timeline-empty">
                  <h2>Nothing scheduled</h2>
                  <p>Create an item or leave this time intentionally open.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="week-calendar" data-testid="planner-grid">
          <div className="week-header">
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => navigate("day", date)}
                className={date === today ? "today" : ""}
              >
                <span>{label(date, { weekday: "short" })}</span>
                <strong>{label(date, { day: "numeric" })}</strong>
              </button>
            ))}
          </div>
          <div className="week-columns">
            {dates.map((date) => {
              const dayItems = items
                .filter(
                  (item) =>
                    itemDate(item, timezone) === date &&
                    item.status !== "cancelled",
                )
                .sort((a, b) =>
                  (a.startAt ?? a.dueAt ?? "").localeCompare(
                    b.startAt ?? b.dueAt ?? "",
                  ),
                );
              return (
                <section
                  key={date}
                  aria-label={label(date, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                >
                  {date === today && <div className="week-now-line" />}
                  {dayItems.length ? (
                    dayItems.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className="week-item"
                        style={
                          {
                            "--item-accent":
                              item.status === "completed"
                                ? "var(--success)"
                                : item.flexibility === "fixed"
                                  ? "var(--navy)"
                                  : item.flexibility === "protected"
                                    ? "var(--gold)"
                                    : "var(--cyan-deep)",
                          } as React.CSSProperties
                        }
                        onClick={() =>
                          router.push(plannerHref("day", date, item.id), {
                            scroll: false,
                          })
                        }
                      >
                        <time>
                          {formatTime(item.startAt ?? item.dueAt, timezone)}
                        </time>
                        <strong>{item.title}</strong>
                      </button>
                    ))
                  ) : (
                    <span className="week-clear">Open</span>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}
      <RepairWorkspace items={items} />
      {selectedItem && (
        <div
          className="detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              router.push(plannerHref(view, selected), { scroll: false });
          }}
        >
          <aside
            className="event-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-detail-title"
          >
            <header className="event-detail-header">
              <div className="min-w-0">
                <p className="eyebrow">Schedule item</p>
                <h2 id="event-detail-title" className="section-title truncate">
                  {selectedItem.title}
                </h2>
              </div>
              <Link
                ref={detailClose}
                href={plannerHref(view, selected)}
                scroll={false}
                aria-label="Close item details"
                className="icon-button"
              >
                <X className="size-5" />
              </Link>
            </header>
            <div className="event-detail-content">
              <dl className="event-detail-meta">
                <div>
                  <dt>Time</dt>
                  <dd>
                    {selectedItem.startAt
                      ? `${formatTime(selectedItem.startAt, timezone)}–${formatTime(selectedItem.endAt, timezone)}`
                      : formatTime(selectedItem.dueAt, timezone)}
                  </dd>
                </div>
                <div>
                  <dt>Flexibility</dt>
                  <dd>{selectedItem.flexibility}</dd>
                </div>
                {selectedItem.locationLabel && (
                  <div>
                    <dt>Location</dt>
                    <dd>{selectedItem.locationLabel}</dd>
                  </div>
                )}
                {selectedItem.recurrenceRule && (
                  <div>
                    <dt>Repeats</dt>
                    <dd>Weekly</dd>
                  </div>
                )}
              </dl>
              <Link
                href={
                  `/assistant?command=${encodeURIComponent(`Reschedule ${selectedItem.title}`)}` as Route
                }
                className="btn btn-outline min-h-11 px-4 text-sm"
              >
                Review a change with Kairos
              </Link>
              {(["scheduled", "in_progress"] as string[]).includes(
                selectedItem.status,
              ) && (
                <CalendarItemActions
                  id={selectedItem.id}
                  version={selectedItem.version}
                  title={selectedItem.title}
                  returnHref={plannerHref(view, selected)}
                />
              )}
              {selectedItem.startAt && selectedItem.endAt && (
                <section className="event-journey-section">
                  <p className="eyebrow">Travel & arrival</p>
                  <h3 className="section-title">Journey Mode</h3>
                  <JourneyMode item={selectedItem} />
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
