import type { Metadata } from "next";
import { HomeDashboard } from "@/components/home-dashboard";
import { getActivityDays } from "@/lib/activity";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isOpenAIConfigured } from "@/lib/scheduling/openai";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

export default async function HomePage() {
  const viewer = await getViewer();
  const [items, activityDays] = await Promise.all([
    getCalendarItems(),
    getActivityDays(viewer),
  ]);
  return (
    <HomeDashboard
      viewer={viewer}
      items={items}
      openAIConfigured={isOpenAIConfigured()}
      activityDays={activityDays}
    />
  );
}
