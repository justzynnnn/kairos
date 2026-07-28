import { useMemo, useRef, type FormEvent } from "react";
import type { CalendarItem } from "@/lib/types";
import EmptyState from "../components/empty-state";
import MoriMascot from "../components/mori-mascot";
import { useMobileData } from "../lib/data";
import { clockTime, dayKey, hourOfDay, longDate } from "../lib/datetime";
import { openAssistantWith } from "../lib/draft";
import { CalendarRange, Mic, Send, Sparkles } from "../lib/icons";

function instant(item: CalendarItem) {
  return item.startAt ?? item.dueAt ?? "9999";
}

function time(value: string | null, timezone: string) {
  if (!value) return "Due";
  return clockTime(new Date(value), timezone);
}

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** "in 2 days", "in 5 hours", "now" — or "overdue" once the moment passes. */
function countdown(value: string, now: Date) {
  const minutes = Math.round(
    (new Date(value).getTime() - now.getTime()) / 60_000,
  );
  if (minutes < 0) return "overdue";
  if (minutes < 60) return relative.format(minutes, "minute");
  if (minutes < 60 * 24)
    return relative.format(Math.round(minutes / 60), "hour");
  return relative.format(Math.round(minutes / (60 * 24)), "day");
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
  const capture = useRef<HTMLInputElement>(null);
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
      // Deadlines carry their moment in dueAt rather than startAt, and the
      // pressure is what makes them worth their own section.
      deadlines: scheduled
        .filter((item) => item.type === "deadline" && item.dueAt)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
        .slice(0, 5),
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
  const {
    now,
    timezone,
    today,
    next,
    deadlines,
    currentStreak,
    greeting,
    last28,
  } = view;

  function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("command") ?? "").trim();
    if (text.length < 2) return;
    event.currentTarget.reset();
    openAssistantWith({ text, submitted: true, record: false });
  }

  function focusCapture() {
    capture.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    capture.current?.focus();
  }

  function recordCapture() {
    openAssistantWith({ text: "", submitted: false, record: true });
  }

  return (
    <main className="page home-page">
      <div className="home-plan-composition">
        <header className="home-web-hero">
          <div className="home-web-hero-copy">
            <p className="eyebrow">{longDate(now, timezone)}</p>
            <h1 className="home-web-hero-title">
              {greeting},<span>{data.viewer.fullName.split(" ")[0]}</span>
            </h1>
            <p className="supporting">
              Here is what needs your attention next.
            </p>
          </div>
        </header>
        <MoriMascot state="wave" alt="" className="home-web-hero-mori" eager />

        <div className="home-priority-stack">
          <section className="home-plan-entry">
            <div className="home-plan-entry-copy">
              <span className="home-plan-entry-icon" aria-hidden="true">
                <Sparkles size={24} strokeWidth={2.2} />
              </span>
              <div>
                <h2>Plan with Mori</h2>
                <p>
                  Start a conversation to plan your day, review changes, and
                  make time for what matters.
                </p>
              </div>
            </div>
            <form className="home-plan-entry-field" onSubmit={submitCapture}>
              <input
                ref={capture}
                name="command"
                placeholder="What needs to happen?"
                maxLength={2_000}
                autoComplete="off"
                aria-label="Ask Mori from Home"
              />
              <button
                type="button"
                className="home-record-button"
                aria-label="Record instead"
                onClick={recordCapture}
              >
                <Mic size={17} strokeWidth={2.5} aria-hidden />
              </button>
              <button aria-label="Open in Mori">
                <Send size={17} strokeWidth={2.5} aria-hidden />
              </button>
            </form>
            <small className="home-plan-entry-note">
              <Sparkles size={16} strokeWidth={2.2} aria-hidden /> Mori reviews
              assumptions, conflicts, and every proposed change.
            </small>
            <small className="home-plan-entry-native-note">
              Apple Intelligence planning and private voice transcription are
              available on this iPhone.
            </small>
          </section>

          <section className="next-up-panel">
            <p className="eyebrow">Next up</p>
            <p className="next-up-meta">
              {next
                ? time(next.startAt, timezone) +
                  " · " +
                  (next.category ?? next.type)
                : "Your open time"}
            </p>
            <h2>{next?.title ?? "Your schedule is clear"}</h2>
            <p>
              {next?.locationLabel ??
                (next
                  ? "Your next commitment is protected."
                  : "There are no upcoming timed items.")}
            </p>
            {!next && (
              <button type="button" onClick={focusCapture}>
                Capture something
              </button>
            )}
          </section>
        </div>
      </div>

      {deadlines.length > 0 && (
        <section className="panel panel-pad">
          <p className="eyebrow">Due soon</p>
          <div className="list">
            {deadlines.map((item) => (
              <article className="row settings-row" key={item.id}>
                <div>
                  <p className="row-title">{item.title}</p>
                  <p className="row-meta">
                    {longDate(new Date(item.dueAt!), timezone)} ·{" "}
                    {time(item.dueAt, timezone)}
                  </p>
                </div>
                <span
                  className={
                    "badge " +
                    (countdown(item.dueAt!, now) === "overdue" ? "pending" : "")
                  }
                >
                  {countdown(item.dueAt!, now)}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

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
              hint="Capture something above and Mori will place it here."
              actionLabel="Capture something"
              onAction={focusCapture}
            />
          )}
        </div>
      </section>
    </main>
  );
}
