import { useMemo, useRef, useState } from "react";
import type { CalendarItem } from "@/lib/types";
import Sheet from "../components/sheet";
import { useMobileData } from "../lib/data";
import { clockTime, dayKey, longDate } from "../lib/datetime";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "../lib/icons";
import {
  addDays,
  addMonths,
  instantAt,
  itemsOnDay,
  layoutDay,
  minutesToOffset,
  monthGrid,
  offsetToMinutes,
  PIXELS_PER_HOUR,
  snap,
  SNAP_MINUTES,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type DayLayout,
} from "../lib/planner-layout";
import { useDragSchedule } from "../lib/use-drag-schedule";

type View = "day" | "week" | "month";

const views: View[] = ["day", "week", "month"];
const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pixelsPerMinute = PIXELS_PER_HOUR / 60;

function hourLabel(hour: number) {
  const normalised = ((hour % 24) + 24) % 24;
  const suffix = normalised < 12 ? "AM" : "PM";
  const display = normalised % 12 === 0 ? 12 : normalised % 12;
  return `${display} ${suffix}`;
}

function sameDate(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export default function Planner() {
  const {
    data,
    conflicts,
    discardConflict,
    queueItemAction,
    rescheduleItem,
    confirmCreates,
  } = useMobileData();
  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [draft, setDraft] = useState<{ date: Date; minutes: number } | null>(
    null,
  );
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMinutes, setDraftMinutes] = useState(60);
  const timezone = data?.viewer.timezone ?? "UTC";
  const calendar = useMemo(() => data?.calendar ?? [], [data]);
  const today = startOfDay(new Date());

  const days = useMemo(() => {
    if (view === "week")
      return Array.from({ length: 7 }, (_, index) =>
        addDays(startOfWeek(anchor), index),
      );
    return [anchor];
  }, [anchor, view]);

  const { drag, consumeClick, onPointerDown, handlers } = useDragSchedule({
    pixelsPerMinute,
    onCommit(item, startShift, endShift) {
      const start = new Date(
        new Date(item.startAt!).getTime() + startShift * 60_000,
      );
      const end = new Date(new Date(item.endAt!).getTime() + endShift * 60_000);
      void rescheduleItem(item, start.toISOString(), end.toISOString());
    },
  });

  function step(direction: number) {
    if (view === "month") setAnchor(addMonths(anchor, direction));
    else setAnchor(addDays(anchor, direction * (view === "week" ? 7 : 1)));
  }

  function openDraft(date: Date, minutes: number) {
    setDraft({ date, minutes: snap(minutes) });
    setDraftTitle("");
    setDraftMinutes(60);
  }

  async function saveDraft() {
    if (!draft || !data || !draftTitle.trim()) return;
    const start = instantAt(draft.date, draft.minutes, timezone);
    const end = new Date(start.getTime() + draftMinutes * 60_000);
    setDraft(null);
    await confirmCreates([
      {
        type: "event",
        title: draftTitle.trim(),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        dueAt: null,
        timezone,
        flexibility: "fixed",
        priority: 3,
        reminderMinutes: 10,
      },
    ]);
  }

  if (!data) return null;

  const heading =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${startOfWeek(anchor).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(startOfWeek(anchor), 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : longDate(anchor, timezone);

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Your schedule</p>
        <h1>Planner</h1>
        <p className="supporting">
          Tap an empty slot to add something. Press and hold an item to move it.
        </p>
      </header>

      <div className="planner-toolbar">
        <div className="segmented" role="group" aria-label="Planner view">
          {views.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="planner-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={20} strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            className="planner-today"
            onClick={() => setAnchor(today)}
          >
            Today
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next"
            onClick={() => step(1)}
          >
            <ChevronRight size={20} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
      <p className="planner-heading" aria-live="polite">
        {heading}
      </p>

      {conflicts.length > 0 && (
        <section
          className="panel panel-pad conflict-panel"
          aria-labelledby="review-heading"
        >
          <p className="eyebrow">Sync review</p>
          <h2 id="review-heading">Your phone and Mori disagree</h2>
          <p className="supporting">
            Nothing was overwritten. Discard a local change to keep the newer
            server version, or recreate it after reviewing today.
          </p>
          <div className="stack">
            {conflicts.map((conflict) => {
              const item = calendar.find(
                (value) => value.id === conflict.operation.targetId,
              );
              return (
                <article
                  className="review-row"
                  key={conflict.operation.clientOperationId}
                >
                  <div>
                    <strong>{item?.title ?? "Local schedule change"}</strong>
                    <p>{conflict.message}</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      void discardConflict(conflict.operation.clientOperationId)
                    }
                  >
                    Keep server version
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          items={calendar}
          timezone={timezone}
          onPick={(date) => {
            if (sameDate(date, anchor)) setView("day");
            else setAnchor(date);
          }}
          onCreate={(date) => openDraft(date, 9 * 60)}
          onOpen={setSelected}
        />
      ) : (
        <section className={"panel timeline-panel " + view}>
          <TimeGrid
            days={days}
            items={calendar}
            timezone={timezone}
            drag={drag}
            consumeClick={consumeClick}
            onPointerDown={onPointerDown}
            handlers={handlers}
            onOpen={setSelected}
            onCreate={openDraft}
          />
        </section>
      )}

      {selected && (
        <Sheet
          title={selected.title}
          description={
            selected.startAt
              ? clockTime(new Date(selected.startAt), timezone) +
                (selected.endAt
                  ? " – " + clockTime(new Date(selected.endAt), timezone)
                  : "")
              : undefined
          }
          onDismiss={() => setSelected(null)}
        >
          {/*
            Dragging is not reachable with a switch, a keyboard, or VoiceOver,
            so the same move is offered here in steps.
          */}
          {selected.startAt && selected.endAt && (
            <div className="nudge-row" role="group" aria-label="Change time">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void rescheduleItem(
                    selected,
                    new Date(
                      new Date(selected.startAt!).getTime() -
                        SNAP_MINUTES * 60_000,
                    ).toISOString(),
                    new Date(
                      new Date(selected.endAt!).getTime() -
                        SNAP_MINUTES * 60_000,
                    ).toISOString(),
                  );
                  setSelected(null);
                }}
              >
                15 min earlier
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void rescheduleItem(
                    selected,
                    new Date(
                      new Date(selected.startAt!).getTime() +
                        SNAP_MINUTES * 60_000,
                    ).toISOString(),
                    new Date(
                      new Date(selected.endAt!).getTime() +
                        SNAP_MINUTES * 60_000,
                    ).toISOString(),
                  );
                  setSelected(null);
                }}
              >
                15 min later
              </button>
            </div>
          )}
          <button
            type="button"
            className="primary full"
            onClick={() => {
              void queueItemAction(selected, "complete");
              setSelected(null);
            }}
          >
            <Check size={18} strokeWidth={2.5} aria-hidden />
            Complete
          </button>
          <button
            type="button"
            className="danger full"
            onClick={() => {
              void queueItemAction(selected, "cancel");
              setSelected(null);
            }}
          >
            <Trash2 size={18} strokeWidth={2.5} aria-hidden />
            Cancel item
          </button>
          <button
            type="button"
            className="secondary full"
            onClick={() => setSelected(null)}
          >
            Dismiss
          </button>
        </Sheet>
      )}

      {draft && (
        <Sheet
          title="New item"
          description={`${longDate(draft.date, timezone)} at ${hourLabel(
            Math.floor(draft.minutes / 60),
          ).replace(/^(\d+)/, (hour) =>
            draft.minutes % 60
              ? `${hour}:${String(draft.minutes % 60).padStart(2, "0")}`
              : hour,
          )}`}
          onDismiss={() => setDraft(null)}
        >
          <label className="field">
            Title
            <input
              value={draftTitle}
              maxLength={160}
              autoFocus
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Lunch with Ana"
            />
          </label>
          <label className="field">
            Length
            <select
              value={draftMinutes}
              onChange={(event) => setDraftMinutes(Number(event.target.value))}
            >
              {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60
                    ? `${minutes} minutes`
                    : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary full"
            disabled={!draftTitle.trim()}
            onClick={() => void saveDraft()}
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            Add to planner
          </button>
          <button
            type="button"
            className="secondary full"
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
        </Sheet>
      )}
    </main>
  );
}

/**
 * The Day and Week grids are the same component. A week is seven day columns
 * scrolling horizontally under one shared hour axis: seven readable columns do
 * not fit across a phone, and squeezing them until they do produces blocks too
 * small to read or to drag onto.
 */
function TimeGrid({
  days,
  items,
  timezone,
  drag,
  consumeClick,
  onPointerDown,
  handlers,
  onOpen,
  onCreate,
}: {
  days: Date[];
  items: CalendarItem[];
  timezone: string;
  drag: ReturnType<typeof useDragSchedule>["drag"];
  consumeClick: ReturnType<typeof useDragSchedule>["consumeClick"];
  onPointerDown: ReturnType<typeof useDragSchedule>["onPointerDown"];
  handlers: ReturnType<typeof useDragSchedule>["handlers"];
  onOpen(item: CalendarItem): void;
  onCreate(date: Date, minutes: number): void;
}) {
  const layouts = useMemo(
    () => days.map((date) => layoutDay(items, date, timezone)),
    [days, items, timezone],
  );
  // One axis for every column, so the hour lines cannot drift apart.
  const scale = useMemo(() => {
    const startMinute = Math.min(...layouts.map((value) => value.startMinute));
    const endMinute = Math.max(...layouts.map((value) => value.endMinute));
    const totalMinutes = Math.max(60, endMinute - startMinute);
    return {
      startMinute,
      endMinute,
      totalMinutes,
      height: (totalMinutes / 60) * PIXELS_PER_HOUR,
      hours: Array.from(
        { length: Math.floor(totalMinutes / 60) + 1 },
        (_, index) => startMinute / 60 + index,
      ),
      items: [],
    } satisfies DayLayout;
  }, [layouts]);

  return (
    <div className="time-grid" {...handlers}>
      <div className="time-axis" style={{ height: scale.height }} aria-hidden>
        {scale.hours.map((hour) => (
          <span
            key={hour}
            className="time-axis-label"
            style={{ top: minutesToOffset(hour * 60, scale) }}
          >
            {hourLabel(hour)}
          </span>
        ))}
      </div>
      <div className="time-columns">
        {days.map((date, index) => (
          <DayColumn
            key={date.toISOString()}
            date={date}
            layout={layouts[index]}
            scale={scale}
            timezone={timezone}
            showHeader={days.length > 1}
            drag={drag}
            consumeClick={consumeClick}
            onPointerDown={onPointerDown}
            onOpen={onOpen}
            onCreate={onCreate}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  layout,
  scale,
  timezone,
  showHeader,
  drag,
  consumeClick,
  onPointerDown,
  onOpen,
  onCreate,
}: {
  date: Date;
  layout: DayLayout;
  scale: DayLayout;
  timezone: string;
  showHeader: boolean;
  drag: ReturnType<typeof useDragSchedule>["drag"];
  consumeClick: ReturnType<typeof useDragSchedule>["consumeClick"];
  onPointerDown: ReturnType<typeof useDragSchedule>["onPointerDown"];
  onOpen(item: CalendarItem): void;
  onCreate(date: Date, minutes: number): void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const isToday = sameDate(date, new Date());
  const nowMinutes = isToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : null;

  return (
    <section className={"day-column" + (isToday ? " today" : "")}>
      {showHeader && (
        <header className="day-column-head">
          <span className="day-name">
            {weekdayNames[(date.getDay() + 6) % 7]}
          </span>
          <span className="day-number">{date.getDate()}</span>
        </header>
      )}
      <div
        className="day-surface"
        ref={surface}
        style={{ height: scale.height }}
        onClick={(event) => {
          // Only a tap on bare canvas creates; a tap on an item is its own
          // handler and stops propagation.
          if (event.target !== surface.current) return;
          const bounds = surface.current.getBoundingClientRect();
          onCreate(date, offsetToMinutes(event.clientY - bounds.top, scale));
        }}
      >
        {scale.hours.map((hour) => (
          <span
            key={hour}
            className="hour-line"
            style={{ top: minutesToOffset(hour * 60, scale) }}
            aria-hidden
          />
        ))}
        {nowMinutes !== null &&
          nowMinutes >= scale.startMinute &&
          nowMinutes <= scale.endMinute && (
            <span
              className="now-line"
              style={{ top: minutesToOffset(nowMinutes, scale) }}
              aria-hidden
            />
          )}
        {layout.items.map((entry) => {
          const active = drag?.id === entry.item.id;
          const startMinutes =
            entry.startMinutes + (active ? drag.startDelta : 0);
          const endMinutes = entry.endMinutes + (active ? drag.endDelta : 0);
          const top = minutesToOffset(startMinutes, scale);
          const height = Math.max(
            26,
            ((endMinutes - startMinutes) / 60) * PIXELS_PER_HOUR,
          );
          const width = 100 / entry.columns;
          return (
            <div
              key={entry.item.id}
              className={
                "grid-item flex-" +
                entry.item.flexibility +
                (active ? " dragging" : "") +
                (entry.item.localSyncStatus ? " pending" : "")
              }
              style={{
                top,
                height,
                left: `${entry.column * width}%`,
                width: `calc(${width}% - 4px)`,
              }}
              role="button"
              tabIndex={0}
              aria-label={`${entry.item.title}, ${clockTime(new Date(entry.item.startAt!), timezone)}. Open for actions.`}
              onPointerDown={(event) =>
                onPointerDown(event, entry.item, "move")
              }
              onClick={(event) => {
                event.stopPropagation();
                if (!consumeClick()) onOpen(entry.item);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(entry.item);
                }
              }}
            >
              <strong>{entry.item.title}</strong>
              <span className="grid-item-time">
                {clockTime(new Date(entry.item.startAt!), timezone)}
              </span>
              <span
                className="resize-handle top"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPointerDown(event, entry.item, "resize-start");
                }}
                aria-hidden
              />
              <span
                className="resize-handle bottom"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPointerDown(event, entry.item, "resize-end");
                }}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Month is a navigator, not a schedule. Dots give the shape of a day at a
 * glance; the agenda underneath is where the detail lives, because a phone-width
 * cell cannot hold a readable title.
 */
function MonthView({
  anchor,
  items,
  timezone,
  onPick,
  onCreate,
  onOpen,
}: {
  anchor: Date;
  items: CalendarItem[];
  timezone: string;
  onPick(date: Date): void;
  onCreate(date: Date): void;
  onOpen(item: CalendarItem): void;
}) {
  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const month = startOfMonth(anchor).getMonth();
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    items.forEach((item) => {
      if (item.status === "cancelled") return;
      const at = item.startAt ?? item.dueAt;
      if (!at) return;
      const key = dayKey(new Date(at), timezone);
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return map;
  }, [items, timezone]);
  const selectedItems = useMemo(
    () =>
      itemsOnDay(items, anchor, timezone).sort((a, b) =>
        (a.startAt ?? a.dueAt ?? "").localeCompare(b.startAt ?? b.dueAt ?? ""),
      ),
    [items, anchor, timezone],
  );
  const today = new Date();

  return (
    <>
      <section className="panel panel-pad month-panel">
        <div className="month-weekdays" aria-hidden>
          {weekdayNames.map((name) => (
            <span key={name}>{name[0]}</span>
          ))}
        </div>
        <div className="month-grid">
          {grid.map((date) => {
            const dayItems = byDay.get(dayKey(date, timezone)) ?? [];
            const outside = date.getMonth() !== month;
            return (
              <button
                key={date.toISOString()}
                type="button"
                className={
                  "month-cell" +
                  (outside ? " outside" : "") +
                  (sameDate(date, anchor) ? " selected" : "") +
                  (sameDate(date, today) ? " today" : "")
                }
                aria-current={sameDate(date, anchor) ? "date" : undefined}
                aria-label={`${longDate(date, timezone)}, ${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`}
                onClick={() => onPick(date)}
              >
                <span className="month-number">{date.getDate()}</span>
                <span className="month-dots" aria-hidden>
                  {dayItems.slice(0, 3).map((item) => (
                    <i
                      key={item.id}
                      className={"dot flex-" + item.flexibility}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="panel panel-pad page">
        <div className="section-head">
          <h2>{longDate(anchor, timezone)}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Add an item on this day"
            onClick={() => onCreate(anchor)}
          >
            <Plus size={20} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <div className="list">
          {selectedItems.length ? (
            selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="row"
                onClick={() => onOpen(item)}
              >
                <div>
                  <p className="row-title">{item.title}</p>
                  <p className="row-meta">
                    {item.startAt
                      ? clockTime(new Date(item.startAt), timezone)
                      : "Due " + clockTime(new Date(item.dueAt!), timezone)}
                  </p>
                </div>
              </button>
            ))
          ) : (
            <p className="supporting">Nothing scheduled. Tap + to add.</p>
          )}
        </div>
      </section>
    </>
  );
}
