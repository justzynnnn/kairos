import { ShieldCheck } from "lucide-react";

export function PreviewBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[var(--gold)]/35 bg-[var(--gold-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--gold-deep)] sm:text-sm">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Local preview.</strong> Connect Supabase for private accounts
        and persistent data.
      </p>
    </div>
  );
}
