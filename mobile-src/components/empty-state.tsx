import type { LucideIcon } from "../lib/icons";

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?(): void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={20} strokeWidth={2} aria-hidden />
      </span>
      <h3>{title}</h3>
      <p>{hint}</p>
      {actionLabel && onAction && (
        <button type="button" className="secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
