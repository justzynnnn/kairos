import { PlannerView } from "@/components/planner-view";
import { getCalendarItems, getViewer } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function Page() {
  const [viewer, items] = await Promise.all([getViewer(), getCalendarItems()]);
  return <PlannerView items={items} timezone={viewer.timezone} />;
}
