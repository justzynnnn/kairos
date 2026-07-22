"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      previousFocus.current?.focus();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="confirm-dialog"
      >
        <h2 id="confirm-title" className="section-title">
          {title}
        </h2>
        <p id="confirm-description">{description}</p>
        <div className="confirm-actions">
          <button
            ref={cancel}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="btn btn-outline min-h-11 px-4"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="btn min-h-11 bg-[var(--error)] px-4 text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
