import { useEffect, useRef, useState } from "react";
import { X } from "../lib/icons";

/**
 * The counterweight to auto mode. Adding items without a confirmation step is
 * only reasonable while undoing them stays one tap away, so this is the review
 * step — moved after the fact instead of removed.
 *
 * It is a status rather than an alert: the schedule changed as the user asked,
 * which is not an interruption. `aria-live="polite"` announces it without
 * pulling focus away from whatever they do next.
 */
export default function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 7000,
}: {
  message: string;
  actionLabel?: string;
  onAction?(): void;
  onDismiss(): void;
  duration?: number;
}) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    // The exit animation is allowed to finish before the node is dropped, so
    // the toast does not vanish mid-slide.
    const hide = window.setTimeout(() => setLeaving(true), duration);
    const remove = window.setTimeout(() => dismiss.current(), duration + 220);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(remove);
    };
  }, [duration]);

  return (
    <div
      className={"toast" + (leaving ? " leaving" : "")}
      role="status"
      aria-live="polite"
    >
      <span className="toast-text">{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={16} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
