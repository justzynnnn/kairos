import Link from "next/link";
import { Waves } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Mori home"
      className="inline-flex items-center gap-2.5 font-display text-lg font-bold text-[var(--navy)]"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-[var(--navy)] text-[var(--cyan)]">
        <Waves className="size-5" aria-hidden="true" />
      </span>
      Mori
    </Link>
  );
}
