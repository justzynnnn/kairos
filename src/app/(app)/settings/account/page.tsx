import type { Metadata } from "next";
import { AccountSettings } from "@/components/settings/account-settings";
import { getViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Account" };
export default async function AccountSettingsPage() {
  const viewer = await getViewer();
  return <AccountSettings email={viewer.email} preview={viewer.preview} />;
}
