import type { Metadata } from "next";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata: Metadata = {
  title: { default: "Settings · Kairos", template: "%s · Kairos" },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account & controls</p>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">
            Focused controls with predictable save behavior and privacy that
            applies everywhere.
          </p>
        </div>
      </header>
      <div className="settings-layout">
        <SettingsNav />
        <section className="min-w-0" aria-label="Settings content">
          {children}
        </section>
      </div>
    </div>
  );
}
