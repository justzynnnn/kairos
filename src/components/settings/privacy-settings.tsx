"use client";

import { Globe2, LoaderCircle, LockKeyhole, Users } from "lucide-react";
import { SettingsFeedback } from "@/components/settings/settings-feedback";
import { useProfileSettings } from "@/components/settings/use-profile-settings";
import type { ScheduleVisibility } from "@/lib/profile/types";

const options: Array<{
  value: ScheduleVisibility;
  label: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only you can inspect your availability.",
    icon: LockKeyhole,
  },
  {
    value: "friends",
    label: "Friends",
    description: "Accepted friends can inspect sanitized free/busy intervals.",
    icon: Users,
  },
  {
    value: "public",
    label: "Kairos users",
    description:
      "Any signed-in Kairos user can inspect sanitized free/busy intervals.",
    icon: Globe2,
  },
];

export function PrivacySettings() {
  const { settings, setSettings, loading, saving, error, notice, save } =
    useProfileSettings();
  if (loading || !settings)
    return <div className="skeleton h-64 rounded-2xl" />;

  async function setVisibility(value: ScheduleVisibility) {
    const next = { ...settings!, scheduleVisibility: value };
    setSettings(next);
    await save(next, "Schedule visibility updated.");
  }

  async function setAggregate(value: boolean) {
    const next = { ...settings!, activityAggregateSharing: value };
    setSettings(next);
    await save(next, "Activity sharing updated.");
  }

  return (
    <div className="settings-content">
      <section className="settings-section" aria-labelledby="visibility-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Availability only</p>
            <h2 id="visibility-title" className="section-title">
              Schedule visibility
            </h2>
            <p className="supporting-text">
              This is one global rule. Kairos never shares titles, descriptions,
              categories, locations, activity, files, coordinates, or
              preferences.
            </p>
          </div>
          {saving && (
            <LoaderCircle
              aria-label="Saving"
              className="size-5 animate-spin text-[var(--muted)]"
            />
          )}
        </div>
        <fieldset className="visibility-options">
          <legend className="sr-only">Who can see your availability</legend>
          {options.map(({ value, label, description, icon: Icon }) => (
            <label key={value} className="visibility-option">
              <input
                type="radio"
                name="schedule-visibility"
                value={value}
                checked={settings.scheduleVisibility === value}
                onChange={() => void setVisibility(value)}
              />
              <Icon className="size-5" />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="privacy-note">
          <LockKeyhole className="size-5" />
          <p>
            Anonymous visitors receive no availability. Public means signed-in
            Kairos users—not the open internet.
          </p>
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="activity-share-title"
      >
        <div className="toggle-row">
          <div>
            <h2 id="activity-share-title" className="item-title">
              Share activity totals
            </h2>
            <p>
              Friends may see aggregate counts and streaks, never individual
              activity titles or timestamps.
            </p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Share activity totals"
              checked={settings.activityAggregateSharing}
              onChange={(event) => void setAggregate(event.target.checked)}
            />
            <span />
          </label>
        </div>
      </section>
      <SettingsFeedback error={error} notice={notice} />
    </div>
  );
}
