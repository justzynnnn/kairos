"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Move,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { durationLabel, formatTime } from "@/lib/format";
import type { CalendarItem } from "@/lib/types";

const accents = {
  fixed: "var(--navy)",
  protected: "var(--gold)",
  flexible: "var(--cyan-deep)",
} as const;

export function CalendarItemCard({
  item,
  timezone = item.timezone,
  detailsHref,
}: {
  item: CalendarItem;
  timezone?: string;
  detailsHref?: Route;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon =
    item.flexibility === "fixed"
      ? LockKeyhole
      : item.flexibility === "protected"
        ? ShieldCheck
        : Move;
  const completeable =
    (item.type === "task" || item.type === "preparation") &&
    item.status === "scheduled";

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar-items/${item.id}/complete`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Item could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`schedule-item ${item.status === "completed" ? "completed" : ""}`}
      style={
        {
          "--item-accent":
            item.status === "completed"
              ? "var(--success)"
              : accents[item.flexibility],
        } as React.CSSProperties
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="item-title truncate">{item.title}</p>
          <span className="status-badge">
            <Icon className="size-3" />
            {item.status === "completed" ? "Done" : item.flexibility}
          </span>
        </div>
        {item.startAt && (
          <p className="schedule-meta">
            <Clock3 className="size-3.5" />
            {formatTime(item.startAt, timezone)}–
            {formatTime(item.endAt, timezone)} · {durationLabel(item)}
          </p>
        )}
        {item.locationLabel && (
          <p className="schedule-meta">
            <MapPin className="size-3.5" />
            {item.locationLabel}
          </p>
        )}
        {item.recurrenceRule && (
          <p className="schedule-meta">
            <Repeat2 className="size-3.5" />
            Repeats weekly
          </p>
        )}
        {(completeable || detailsHref) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {detailsHref && (
              <Link
                href={detailsHref}
                scroll={false}
                className="btn btn-ghost min-h-9 px-2 text-xs text-[var(--cyan-deep)]"
              >
                View details
              </Link>
            )}
            {completeable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void complete()}
                className="btn btn-ghost min-h-9 px-2 text-xs"
              >
                {busy ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Mark complete
              </button>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-2 text-xs font-semibold text-[var(--error)]"
          >
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
