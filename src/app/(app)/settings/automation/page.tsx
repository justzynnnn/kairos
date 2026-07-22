import type { Metadata } from "next";
import { AutomationSettings } from "@/components/settings/automation-settings";
export const metadata: Metadata = { title: "Automation" };
export default function AutomationSettingsPage() {
  return <AutomationSettings />;
}
