import { useEffect, useRef, type ReactNode } from "react";

/**
 * A bottom sheet built on the existing .modal/.modal-backdrop pair. It exists
 * so destructive schedule actions stop going through confirm(): a system dialog
 * is drawn by the OS in its own colour scheme, so it is the one surface in the
 * app that cannot follow --canvas.
 */
export default function Sheet({
  title,
  description,
  onDismiss,
  children,
}: {
  title: string;
  description?: string;
  onDismiss(): void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", dismissOnEscape);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [onDismiss]);
  return (
    <div
      className="modal-backdrop"
      onClick={onDismiss}
      role="presentation"
      data-testid="sheet-backdrop"
    >
      <div
        ref={panel}
        className="modal sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sheet-grabber" aria-hidden />
        <h2 style={{ margin: 0 }}>{title}</h2>
        {description && <p className="supporting">{description}</p>}
        <div className="sheet-actions">{children}</div>
      </div>
    </div>
  );
}
