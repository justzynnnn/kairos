import { AppShell } from "@/components/app-shell";
import { getViewer } from "@/lib/data";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell viewer={await getViewer()}>{children}</AppShell>;
}
