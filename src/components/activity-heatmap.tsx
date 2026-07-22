import { LockKeyhole, TrendingUp } from "lucide-react";
import { currentActivityStreak, type ActivityDay } from "@/lib/activity-utils";
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
  compact = false,
}: {
  days: ActivityDay[];
  preview: boolean;
  compact?: boolean;
}) {
  const active = days.filter((day) => day.level > 0).length,
    total = days.reduce((sum, day) => sum + day.count, 0),
    streak = currentActivityStreak(days);
  return (
    <section
      className={`card activity-heatmap ${compact ? "activity-heatmap-compact" : ""}`}
      aria-labelledby="activity-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--outline)] p-5">
        <div>
          <p className="eyebrow">
            {compact ? "Private consistency" : "Private activity"}
          </p>
          <h2
            id="activity-title"
            className="font-display mt-1 text-xl font-semibold text-[var(--navy)]"
          >
            {compact ? "Your activity rhythm" : "Your protected-time rhythm"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {compact
              ? "A private view of the last 12 weeks."
              : "A GitHub-style view of scheduling actions over the last 12 weeks."}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cyan-soft)] px-3 py-1.5 text-xs font-bold text-[var(--cyan-deep)]">
          <LockKeyhole className="size-3" />
          Only you
        </span>
      </header>
      <div className="p-5">
        <div
          className="activity-streak"
          aria-label={`${streak} day activity streak`}
        >
          <TrendingUp className="size-4" aria-hidden />
          <strong>{streak}</strong>
          <span>day streak</span>
          <p>
            {streak
              ? "Keep your momentum going today."
              : "Complete or protect time today to start a streak."}
          </p>
        </div>
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
