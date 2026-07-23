import { useMemo, useState } from "react";
import type { CalendarItem } from "@/lib/types";
import Sheet from "../components/sheet";
import { useMobileData } from "../lib/data";
import { clockTime, dayKey, minutesIntoDay } from "../lib/datetime";
import { Check, Trash2 } from "../lib/icons";

const startHour = 6;
const endHour = 23;
const totalMinutes = (endHour - startHour) * 60;

export default function Planner() {
  const { data, conflicts, discardConflict, queueItemAction } = useMobileData();
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const timezone = data?.viewer.timezone ?? "UTC";
  const items = useMemo(() => {
    if (!data) return [];
    const todayKey = dayKey(new Date(), timezone);
    return data.calendar
      .filter((item) => {
        const value = item.startAt ?? item.dueAt;
        return (
          item.status !== "cancelled" &&
          item.startAt &&
          value &&
          dayKey(new Date(value), timezone) === todayKey
        );
      })
      .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
  }, [data, timezone]);
  if (!data) return null;
  return (
    <main className="page">
      <header>
        <p className="eyebrow">Vertical time axis</p>
        <h1>Planner</h1>
        <p className="supporting">
          Time runs down the left. Tap an item for quick actions.
        </p>
      </header>
      {conflicts.length > 0 && (
        <section
          className="panel panel-pad conflict-panel"
          aria-labelledby="review-heading"
        >
          <p className="eyebrow">Sync review</p>
          <h2 id="review-heading">Your phone and Kairos disagree</h2>
          <p className="supporting">
            Nothing was overwritten. Discard a local change to keep the newer
            server version, or recreate it after reviewing today.
          </p>
          <div className="stack">
            {conflicts.map((conflict) => {
              const item = data.calendar.find(
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
      <section className="panel panel-pad">
        <div className="timeline">
          {Array.from({ length: endHour - startHour + 1 }, (_, index) => {
            const top = (index * 60 * 960) / totalMinutes;
            return (
              <div key={index}>
                <span className="time-label" style={{ top }}>
                  {String(startHour + index).padStart(2, "0")}:00
                </span>
                <span
                  className="time-guide"
                  style={{ top, left: 58 }}
                  aria-hidden
                />
              </div>
            );
          })}
          {items.map((item) => {
            const start = minutesIntoDay(new Date(item.startAt!), timezone);
            const end = item.endAt
              ? minutesIntoDay(new Date(item.endAt), timezone)
              : start + 30;
            const top = ((start - startHour * 60) * 960) / totalMinutes;
            const height = Math.max(38, ((end - start) * 960) / totalMinutes);
            return (
              <button
                type="button"
                className="timeline-item"
                key={item.id}
                style={{ top, height }}
                onClick={() => setSelected(item)}
              >
                <strong>{item.title}</strong>
                <br />
                {clockTime(new Date(item.startAt!), timezone)}
              </button>
            );
          })}
        </div>
      </section>
      {selected && (
        <Sheet
          title={selected.title}
          description={
            clockTime(new Date(selected.startAt!), timezone) +
            (selected.endAt
              ? " – " + clockTime(new Date(selected.endAt), timezone)
              : "")
          }
          onDismiss={() => setSelected(null)}
        >
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
    </main>
  );
}
