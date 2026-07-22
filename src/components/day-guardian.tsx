"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { RepairWorkspace } from "@/components/repair-workspace";
import type { RepairIncident } from "@/lib/repair/incidents-types";
import type { CalendarItem } from "@/lib/types";
import {
  publishRepairIncident,
  readPublishedRepairIncident,
  repairIncidentEvent,
} from "@/lib/repair/client-events";

export function DayGuardian({ items }: { items: CalendarItem[] }) {
  const router = useRouter(),
    [incident, setIncident] = useState<RepairIncident | null>(null),
    [reviewing, setReviewing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const linkedId = new URLSearchParams(window.location.search).get(
        "incident",
      ),
      timer = window.setTimeout(() => {
        if (!linkedId) setIncident(readPublishedRepairIncident());
      }, 0),
      handler = (event: Event) =>
        setIncident((event as CustomEvent<RepairIncident | null>).detail);
    if (linkedId)
      void fetch(`/api/repair/incidents/${encodeURIComponent(linkedId)}`)
        .then(async (response) => {
          const data = await response.json();
          if (response.ok) {
            setIncident(data.incident);
            publishRepairIncident(data.incident);
          }
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => {});
    window.addEventListener(repairIncidentEvent, handler);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(repairIncidentEvent, handler);
    };
  }, []);
  async function dismiss() {
    if (!incident) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
          `/api/repair/incidents/${incident.id}/dismiss`,
          { method: "POST" },
        ),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "This repair could not be dismissed.");
      publishRepairIncident(null);
      setIncident(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This repair could not be dismissed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (!incident) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
          `/api/repair/incidents/${incident.id}/undo`,
          { method: "POST" },
        ),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "This repair could not be undone.");
      publishRepairIncident(null);
      setIncident(null);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This repair could not be undone.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!incident && !error) return null;
  if (!incident)
    return (
      <p
        role="alert"
        className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]"
      >
        {error}
      </p>
    );
  const attention = incident.status === "needs_attention";
  return (
    <div className="space-y-4">
      <section
        className={`card overflow-hidden border-l-4 ${attention ? "border-l-[var(--gold)]" : "border-l-[var(--cyan-deep)]"}`}
        aria-label="Schedule repair"
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full ${attention ? "bg-[var(--gold-soft)] text-[var(--gold-deep)]" : "bg-[var(--cyan-soft)] text-[var(--cyan-deep)]"}`}
          >
            {attention ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Check className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              {incident.trigger === "traffic"
                ? "Traffic disruption"
                : "Day-start adjustment"}
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold text-[var(--navy)]">
              {attention
                ? "Your priorities need a decision"
                : "Kairos repaired the flexible parts of your day"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {incident.reason}
            </p>
            {incident.operations.length > 0 && (
              <ul className="mt-3 grid gap-1 text-sm text-[var(--ink)]">
                {incident.operations.map((operation) => (
                  <li key={operation.id}>
                    <strong>{operation.title}</strong> · {operation.kind}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              <ShieldCheck className="size-4" />
              {attention
                ? "Nothing protected was changed automatically."
                : "Fixed and protected commitments were not changed."}
            </p>
            {error && (
              <p
                role="alert"
                className="mt-3 text-sm font-semibold text-[#93000a]"
              >
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {incident.canUndo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void undo()}
                  className="btn btn-outline min-h-11 px-4 text-sm"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Undo repair
                </button>
              )}
              {attention && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setReviewing((value) => !value)}
                  className="btn btn-primary min-h-11 px-4 text-sm"
                >
                  {reviewing ? "Hide options" : "Review protected options"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void dismiss()}
                className="btn btn-ghost min-h-11 px-4 text-sm"
              >
                <X className="size-4" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </section>
      {attention && reviewing && <RepairWorkspace items={items} />}
    </div>
  );
}
