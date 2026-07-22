"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function CalendarItemActions({
  id,
  version,
  title,
  returnHref,
}: {
  id: string;
  version: number;
  title: string;
  returnHref: Route;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar-items/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfirming(false);
      router.push(returnHref, { scroll: false });
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Item could not be cancelled.",
      );
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-danger min-h-11 px-4 text-sm"
      >
        Cancel item
      </button>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        busy={busy}
        title="Cancel this schedule item?"
        description={`${title} will leave the active calendar but remain in history. This does not delete its audit record.`}
        confirmLabel="Cancel item"
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
