import { HomeDashboard } from "@/components/home-dashboard";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isOpenAIConfigured } from "@/lib/scheduling/openai";
import { getActivityDays } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [viewer, items] = await Promise.all([getViewer(), getCalendarItems()]);
  const activityDays=await getActivityDays(viewer);
  return <HomeDashboard viewer={viewer} items={items} openAIConfigured={isOpenAIConfigured()} activityDays={activityDays}/>;
}
