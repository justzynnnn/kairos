import type { CalendarItem } from "@/lib/types";
import { useMobileData } from "../lib/data";

function instant(item: CalendarItem) {
  return item.startAt ?? item.dueAt ?? "9999";
}

function sameDate(value: string | null, timezone: string, date: Date) {
  if (!value) return false;
  const format = (input: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(input);
  return format(new Date(value)) === format(date);
}

function time(value: string | null, timezone: string) {
  if (!value) return "Due";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function streak(items: CalendarItem[], timezone: string) {
  const completed = new Set(
    items
      .filter((item) => item.status === "completed")
      .map((item) => {
        const value = instant(item);
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value));
      }),
  );
  let days = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const day = new Date(Date.now() - offset * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(day);
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
  if (!data) return null;
  const now = new Date();
  const timezone = data.viewer.timezone;
  const scheduled = data.calendar.filter((item) => item.status === "scheduled");
  const today = scheduled
    .filter((item) => sameDate(instant(item), timezone, now))
    .sort((a, b) => instant(a).localeCompare(instant(b)));
  const next =
    scheduled
      .filter(
        (item) =>
          item.startAt && new Date(item.startAt).getTime() >= now.getTime(),
      )
      .sort((a, b) => instant(a).localeCompare(instant(b)))[0] ?? null;
  const currentStreak = streak(data.calendar, timezone);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const last28 = Array.from({ length: 28 }, (_, index) => {
    const day = new Date(now.getTime() - (27 - index) * 86_400_000);
    return data.calendar.filter(
      (item) =>
        item.status === "completed" && sameDate(instant(item), timezone, day),
    ).length;
  });

  return (
    <main className="page">
      <header>
        <p className="eyebrow">
          {new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(now)}
        </p>
        <h1>
          {greeting}, {data.viewer.fullName.split(" ")[0]}
        </h1>
        <p className="supporting">Here is what needs your attention next.</p>
      </header>
      <section className="hero">
        <p className="eyebrow" style={{ color: "#a9edf3" }}>
          Next up
        </p>
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
            <p className="supporting">No remaining items today.</p>
          )}
        </div>
      </section>
    </main>
  );
}
