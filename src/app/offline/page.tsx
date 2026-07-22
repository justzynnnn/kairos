import type { Metadata } from "next";
import { OfflineState } from "@/components/offline-state";
export const metadata: Metadata = { title: "Offline" };
export default function OfflinePage() {
  return <OfflineState />;
}
