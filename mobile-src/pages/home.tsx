import { useMemo } from "react";
import type { CalendarItem } from "@/lib/types";
import EmptyState from "../components/empty-state";
import { useMobileData } from "../lib/data";
import { clockTime, dayKey, hourOfDay, longDate } from "../lib/datetime";
import { CalendarRange, Sparkles } from "../lib/icons";

function instant(item: CalendarItem) {
  return item.startAt ?? item.dueAt ?? "9999";
}

function time(value: string | null, timezone: string) {
  if (!value) return "Due";
  return clockTime(new Date(value), timezone);
}

function completedDayKeys(items: CalendarItem[], timezone: string) {
  const counts = new Map<string, number>();
  items
    .filter((item) => item.status === "completed")
    .forEach((item) => {
      const key = dayKey(new Date(instant(item)), timezone);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  return counts;
}

function streak(completed: Map<string, number>, timezone: string) {
  let days = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const key = dayKey(new Date(Date.now() - offset * 86_400_000), timezone);
    if (!completed.has(key)) {
      if (offset === 0) continue;
      break;
    }
    days += 1;
  }
  return days;
}

export default function Home() {
  const { data } = useMobileData();
  const view = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const timezone = data.viewer.timezone;
    const todayKey = dayKey(now, timezone);
    const scheduled = data.calendar.filter(
      (item) => item.status === "scheduled",
    );
    const today = scheduled
      .filter((item) => dayKey(new Date(instant(item)), timezone) === todayKey)
      .sort((a, b) => instant(a).localeCompare(instant(b)));
    const next =
      scheduled
        .filter(
          (item) =>
            item.startAt && new Date(item.startAt).getTime() >= now.getTime(),
        )
        .sort((a, b) => instant(a).localeCompare(instant(b)))[0] ?? null;
    const completed = completedDayKeys(data.calendar, timezone);
    const hour = hourOfDay(now, timezone);
    return {
      now,
      timezone,
      today,
      next,
      currentStreak: streak(completed, timezone),
      greeting:
        hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening",
      last28: Array.from({ length: 28 }, (_, index) => {
        const day = new Date(now.getTime() - (27 - index) * 86_400_000);
        return completed.get(dayKey(day, timezone)) ?? 0;
      }),
    };
  }, [data]);
  if (!data || !view) return null;
  const { now, timezone, today, next, currentStreak, greeting, last28 } = view;

  return (
    <main className="page">
      <header>
        <p className="eyebrow">{longDate(now, timezone)}</p>
        <h1>
          {greeting}, {data.viewer.fullName.split(" ")[0]}
        </h1>
        <p className="supporting">What needs you next.</p>
      </header>
      <section className="hero">
        <p className="eyebrow">Next up</p>
        <h2>{next?.title ?? "Your schedule is clear"}</h2>
        <p>
          {next
            ? time(next.startAt, timezone) +
              (next.locationLabel ? " · " + next.locationLabel : "")
            : "There are no upcoming timed items."}
        </p>
      </section>
      <section className="panel panel-pad">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Momentum</p>
            <h2 style={{ marginBottom: 4 }}>
              {currentStreak} day{currentStreak === 1 ? "" : "s"} in a row
            </h2>
          </div>
          <span className="badge">Streak</span>
        </div>
        {last28.every((count) => count === 0) ? (
          <EmptyState
            icon={Sparkles}
            title="No completions yet"
            hint="Finish something on your schedule and your streak starts here."
          />
        ) : (
          <div className="heatmap" aria-label="Completion heatmap">
            {last28.map((count, index) => (
              <span
                key={index}
                className={
                  "heat-day " +
                  (count >= 3
                    ? "l3"
                    : count === 2
                      ? "l2"
                      : count === 1
                        ? "l1"
                        : "")
                }
                title={count + " completed"}
              />
            ))}
          </div>
        )}
      </section>
      <section className="panel panel-pad">
        <p className="eyebrow">Chronological</p>
        <h2>Today&apos;s agenda</h2>
        <div className="list">
          {today.length ? (
            today.map((item) => (
              <article className="row" key={item.id}>
                <span className="row-time">
                  {time(item.startAt ?? item.dueAt, timezone)}
                </span>
                <div>
                  <p className="row-title">{item.title}</p>
                  <p className="row-meta">{item.category ?? item.type}</p>
                </div>
                {"localSyncStatus" in item && (
                  <span className="badge pending">On phone</span>
                )}
              </article>
            ))
          ) : (
            <EmptyState
              icon={CalendarRange}
              title="No remaining items today"
              hint="Ask Kairos to schedule something and it will appear here."
              actionLabel="Open Kairos"
              onAction={() => {
                location.hash = "#assistant";
              }}
            />
          )}
        </div>
      </section>
    </main>
  );
}
