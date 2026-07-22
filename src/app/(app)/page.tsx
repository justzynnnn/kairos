import type { Metadata } from "next";
import { HomeDashboard } from "@/components/home-dashboard";
import { getCalendarItems, getViewer } from "@/lib/data";
import { isOpenAIConfigured } from "@/lib/scheduling/openai";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

export default async function HomePage() {
  const [viewer, items] = await Promise.all([getViewer(), getCalendarItems()]);
  return (
    <HomeDashboard
      viewer={viewer}
      items={items}
      openAIConfigured={isOpenAIConfigured()}
    />
  );
}
