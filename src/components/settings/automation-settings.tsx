"use client";

import { LoaderCircle } from "lucide-react";
import { SettingsFeedback } from "@/components/settings/settings-feedback";
import { useProfileSettings } from "@/components/settings/use-profile-settings";
import type { ProfileSettings } from "@/lib/profile/types";

const rows: Array<{
  key: "locationEnabled" | "automationReminders" | "automationLateness";
  label: string;
  description: string;
}> = [
  {
    key: "locationEnabled",
    label: "Location for Journey Mode",
    description:
      "Use foreground location only while you actively run a journey.",
  },
  {
    key: "automationReminders",
    label: "Schedule reminders",
    description: "Create private reminders near an upcoming event.",
  },
  {
    key: "automationLateness",
    label: "Possible lateness notices",
    description:
      "Prepare a private warning when your schedule appears to be slipping.",
  },
];

export function AutomationSettings() {
  const { settings, setSettings, loading, saving, error, notice, save } =
    useProfileSettings();
  if (loading || !settings)
    return <div className="skeleton h-64 rounded-2xl" />;

  async function toggle(key: (typeof rows)[number]["key"], enabled: boolean) {
    const next: ProfileSettings = { ...settings!, [key]: enabled };
    setSettings(next);
    await save(next, "Automation setting updated.");
  }

  return (
    <div className="settings-content">
      <section className="settings-section" aria-labelledby="automation-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Independent controls</p>
            <h2 id="automation-title" className="section-title">
              Automation
            </h2>
            <p className="supporting-text">
              Each switch saves immediately. Kairos asks before sending anything
              to another person.
            </p>
          </div>
          {saving && (
            <LoaderCircle
              aria-label="Saving"
              className="size-5 animate-spin text-[var(--muted)]"
            />
          )}
        </div>
        <div className="divide-y divide-[var(--outline-soft)]">
          {rows.map((row) => (
            <div key={row.key} className="toggle-row">
              <div>
                <h3 className="item-title">{row.label}</h3>
                <p>{row.description}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={row.label}
                  checked={settings[row.key]}
                  onChange={(event) =>
                    void toggle(row.key, event.target.checked)
                  }
                />
                <span />
              </label>
            </div>
          ))}
        </div>
      </section>
      <SettingsFeedback error={error} notice={notice} />
    </div>
  );
}
