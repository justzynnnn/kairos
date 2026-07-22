"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import type { ActivityEvent } from "@/lib/profile/types";

const icons = {
  task_completion: CheckCircle2,
  deadline: Clock3,
  meeting: CalendarCheck,
  preparation: Activity,
  schedule_adherence: ShieldCheck,
} as const;

export function ActivitySettings() {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/activity", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setActivity(data.activity ?? []);
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(
            reason instanceof Error
              ? reason.message
              : "Activity could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <div className="skeleton h-72 rounded-2xl" />;
  return (
    <div className="settings-content">
      <section className="settings-section" aria-labelledby="activity-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Private by design</p>
            <h2 id="activity-title" className="section-title">
              Activity history
            </h2>
            <p className="supporting-text">
              A personal record of completions and protected-time actions.
              Detailed entries are never shared.
            </p>
          </div>
        </div>
        {error ? (
          <p className="inline-error" role="alert">
            <AlertCircle className="size-4" />
            {error}
          </p>
        ) : activity.length ? (
          <ol className="activity-list">
            {activity.map((event) => {
              const Icon = icons[event.type];
              return (
                <li key={event.id}>
                  <span className="activity-icon">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {event.type.replaceAll("_", " ")} ·{" "}
                      <time>
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(event.createdAt))}
                      </time>
                    </p>
                  </div>
                  <span className="activity-score">+{event.score}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty-row">
            Your private activity will appear here as you complete schedule
            items.
          </p>
        )}
      </section>
    </div>
  );
}
