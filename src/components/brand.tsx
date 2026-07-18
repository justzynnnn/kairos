import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-bold text-[var(--navy)]"><Image src="/kairos-mascot.png" alt="" width={40} height={40} className="size-10 rounded-xl object-cover" priority />Kairos</Link>;
}
