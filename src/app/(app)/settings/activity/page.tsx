import type { Metadata } from "next";
import { ActivitySettings } from "@/components/settings/activity-settings";
export const metadata: Metadata = { title: "Activity" };
export default function ActivitySettingsPage() {
  return <ActivitySettings />;
}
