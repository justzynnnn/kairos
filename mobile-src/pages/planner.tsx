import type { CalendarItem } from "@/lib/types";
import { useMobileData } from "../lib/data";

function minutes(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}

function sameDay(item: CalendarItem, timezone: string) {
  const value = item.startAt ?? item.dueAt;
  if (!value) return false;
  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  return format(new Date(value)) === format(new Date());
}

export default function Planner() {
  const { data, conflicts, discardConflict, queueItemAction } = useMobileData();
  if (!data) return null;
  const timezone = data.viewer.timezone;
  const startHour = 6;
  const endHour = 23;
  const totalMinutes = (endHour - startHour) * 60;
  const items = data.calendar
    .filter(
      (item) =>
        item.status !== "cancelled" && sameDay(item, timezone) && item.startAt,
    )
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
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
            const start = minutes(item.startAt!, timezone);
            const end = item.endAt ? minutes(item.endAt, timezone) : start + 30;
            const top = ((start - startHour * 60) * 960) / totalMinutes;
            const height = Math.max(38, ((end - start) * 960) / totalMinutes);
            return (
              <button
                type="button"
                className="timeline-item"
                key={item.id}
                style={{
                  top,
                  height,
                  border: 0,
                  borderLeft: "4px solid #087b8d",
                }}
                onClick={() => {
                  if (confirm("Mark “" + item.title + "” complete?"))
                    void queueItemAction(item, "complete");
                }}
              >
                <strong>{item.title}</strong>
                <br />
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: timezone,
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(item.startAt!))}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
