import { PlannerView } from "@/components/planner-view";
import type { Metadata } from "next";
import { getCalendarItems, getViewer } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planner" };
export default async function Page() {
  const [viewer, items] = await Promise.all([getViewer(), getCalendarItems()]);
  return <PlannerView items={items} timezone={viewer.timezone} />;
}
