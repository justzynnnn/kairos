import { LockKeyhole, TrendingUp } from "lucide-react";
import type { ActivityDay } from "@/lib/activity";
const colors = [
  "bg-[var(--surface-low)]",
  "bg-[#d8f1f7]",
  "bg-[#96deec]",
  "bg-[var(--cyan)]",
  "bg-[var(--navy-container)]",
];
export function ActivityHeatmap({
  days,
  preview,
}: {
  days: ActivityDay[];
  preview: boolean;
}) {
  const active = days.filter((day) => day.level > 0).length,
    total = days.reduce((sum, day) => sum + day.count, 0);
  return (
    <section className="card overflow-hidden" aria-labelledby="activity-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--outline)] p-5">
        <div>
          <p className="eyebrow">Private activity</p>
          <h2
            id="activity-title"
            className="font-display mt-1 text-xl font-semibold text-[var(--navy)]"
          >
            Your protected-time rhythm
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A GitHub-style view of scheduling actions over the last 12 weeks.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cyan-soft)] px-3 py-1.5 text-xs font-bold text-[var(--cyan-deep)]">
          <LockKeyhole className="size-3" />
          Only you
        </span>
      </header>
      <div className="p-5">
        <div className="overflow-x-auto pb-2">
          <div
            className="grid w-max grid-flow-col grid-rows-7 gap-1"
            role="img"
            aria-label={`${active} active days and ${total} scheduling actions in the last 12 weeks`}
          >
            {days.map((day) => (
              <span
                key={day.date}
                title={`${day.date}: ${day.count} scheduling action${day.count === 1 ? "" : "s"}`}
                aria-label={`${day.date}: ${day.count} actions`}
                className={`size-3 rounded-[3px] border border-black/5 ${colors[day.level]}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="size-4 text-[var(--cyan-deep)]" />
            {active} active days · {total} protected actions
          </span>
          <span className="inline-flex items-center gap-1">
            Less{" "}
            {colors.map((color) => (
              <i
                key={color}
                aria-hidden
                className={`size-3 rounded-[3px] border border-black/5 ${color}`}
              />
            ))}{" "}
            More
          </span>
        </div>
        {preview && (
          <p className="mt-3 text-[11px] text-[var(--muted)]">
            Preview history is seeded for demonstration. Connected accounts use
            your private audit activity.
          </p>
        )}
      </div>
    </section>
  );
}
