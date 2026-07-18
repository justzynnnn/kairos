import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { CalendarItemCard } from "@/components/calendar-item-card";
import { HomeAssistantComposer } from "@/components/home-assistant-composer";
import { RepairWorkspace } from "@/components/repair-workspace";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import type { ActivityDay } from "@/lib/activity";
import { formatDate, isSameLocalDay } from "@/lib/format";
import type { CalendarItem, Viewer } from "@/lib/types";

export function HomeDashboard({ viewer, items, openAIConfigured, activityDays }: { viewer: Viewer; items: CalendarItem[]; openAIConfigured: boolean; activityDays:ActivityDay[] }) {
  const now = new Date();
  const today = items.filter((item) => isSameLocalDay(item.startAt, now, viewer.timezone));
  const deadline = items.find((item) => item.type === "deadline");
  return <div className="space-y-6"><header><p className="eyebrow">{formatDate(now.toISOString())}</p><h1 className="page-title mt-2">Good morning, {viewer.fullName}</h1><p className="mt-2 text-[var(--muted)]">Your temporal guardian is ready to protect your plan.</p></header><HomeAssistantComposer openAIConfigured={openAIConfigured} /><RepairWorkspace items={items} compact/><ActivityHeatmap days={activityDays} preview={viewer.preview}/><div className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]"><section className="card p-5"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-[var(--navy)]">Today&apos;s timeline</h2><Link href="/planner" className="text-sm font-semibold text-[var(--cyan-deep)]">Planner</Link></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{today.length ? today.map((item) => <CalendarItemCard key={item.id} item={item} />) : <p className="text-[var(--muted)]">Your day is clear.</p>}</div></section><div className="grid content-start gap-6"><section className="card border-l-4 border-l-[var(--gold)] p-5"><p className="eyebrow">Deadline</p><h2 className="font-display mt-1 font-semibold text-[var(--navy)]">{deadline?.title ?? "No deadline"}</h2>{deadline?.dueAt && <p className="mt-2 text-sm text-[var(--muted)]">Due {formatDate(deadline.dueAt)}</p>}<Sparkles className="mt-4 size-5 text-[var(--gold-deep)]" /></section><section className="card bg-[var(--cyan-soft)] p-5 text-[var(--cyan-deep)]"><ShieldCheck className="size-6" /><h2 className="font-display mt-3 font-semibold">You confirm every change</h2><p className="mt-1 text-sm">AI interpretation never writes directly to your calendar.</p></section></div></div></div>;
}
