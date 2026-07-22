import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { CalendarItemCard } from "@/components/calendar-item-card";
import { DayGuardian } from "@/components/day-guardian";
import { HomeAssistantComposer } from "@/components/home-assistant-composer";
import {
  formatDate,
  formatTime,
  greetingFor,
  isSameLocalDay,
} from "@/lib/format";
import type { CalendarItem, Viewer } from "@/lib/types";

function itemInstant(item: CalendarItem) {
  return item.startAt ?? item.dueAt ?? "9999-12-31";
}

export function HomeDashboard({
  viewer,
  items,
  openAIConfigured,
}: {
  viewer: Viewer;
  items: CalendarItem[];
  openAIConfigured: boolean;
}) {
  const now = new Date();
  const scheduled = items.filter((item) => item.status === "scheduled");
  const today = scheduled
    .filter((item) => isSameLocalDay(itemInstant(item), now, viewer.timezone))
    .sort((a, b) => itemInstant(a).localeCompare(itemInstant(b)));
  const nextUp =
    scheduled
      .filter(
        (item) =>
          item.startAt && new Date(item.startAt).getTime() >= now.getTime(),
      )
      .sort((a, b) => itemInstant(a).localeCompare(itemInstant(b)))[0] ?? null;
  const deadlines = scheduled
    .filter((item) => item.type === "deadline" && item.dueAt)
    .sort((a, b) => itemInstant(a).localeCompare(itemInstant(b)))
    .slice(0, 3);

  return (
    <div className="page-stack home-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {formatDate(now.toISOString(), viewer.timezone)}
          </p>
          <h1 className="page-title mt-2">
            {greetingFor(viewer.timezone, now)}, {viewer.fullName}
          </h1>
          <p className="page-description">
            Here is what needs your attention next.
          </p>
        </div>
      </header>
      <DayGuardian items={items} />
      <div className="home-priority-grid">
        <section className="next-up-panel">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-white/60">Next up</p>
            <Clock3 className="size-5 text-[var(--cyan)]" />
          </div>
          {nextUp ? (
            <>
              <p className="mt-5 text-sm text-white/65">
                {formatTime(nextUp.startAt, viewer.timezone)} ·{" "}
                {nextUp.category ?? nextUp.type}
              </p>
              <h2>{nextUp.title}</h2>
              {nextUp.locationLabel && (
                <p className="mt-2 text-sm text-white/65">
                  {nextUp.locationLabel}
                </p>
              )}
              <Link
                href="/planner"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--cyan)]"
              >
                Open in Planner <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-5">Your schedule is clear</h2>
              <p className="mt-2 text-sm text-white/65">
                There are no upcoming timed items.
              </p>
            </>
          )}
        </section>
        <HomeAssistantComposer openAIConfigured={openAIConfigured} />
      </div>

      <div className="home-detail-grid">
        <section className="agenda-section">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Chronological</p>
              <h2 className="section-title">Today&apos;s agenda</h2>
            </div>
            <Link
              href="/planner"
              className="text-sm font-semibold text-[var(--cyan-deep)]"
            >
              Full planner
            </Link>
          </header>
          <div className="agenda-list">
            {today.length ? (
              today.map((item) => (
                <CalendarItemCard
                  key={item.id}
                  item={item}
                  timezone={viewer.timezone}
                />
              ))
            ) : (
              <div className="empty-state min-h-48">
                <ShieldCheck className="size-7" />
                <h2>No remaining items today</h2>
                <p>Use the open time deliberately—or ask Kairos to plan it.</p>
              </div>
            )}
          </div>
        </section>
        <aside className="deadline-panel">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-[var(--gold-deep)]" />
            <div>
              <p className="eyebrow">Due soon</p>
              <h2 className="section-title">Deadlines</h2>
            </div>
          </div>
          <div className="mt-4 divide-y divide-[var(--outline-soft)]">
            {deadlines.length ? (
              deadlines.map((deadline) => (
                <article key={deadline.id} className="py-3">
                  <strong>{deadline.title}</strong>
                  <p>
                    {deadline.dueAt
                      ? `${formatDate(deadline.dueAt, viewer.timezone)} · ${formatTime(deadline.dueAt, viewer.timezone)}`
                      : "No due time"}
                  </p>
                </article>
              ))
            ) : (
              <p className="py-4 text-sm text-[var(--muted)]">
                No active deadlines.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
