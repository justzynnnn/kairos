"use client";

import { LoaderCircle, LogOut, RotateCcw, Save } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { SettingsFeedback } from "@/components/settings/settings-feedback";
import { useProfileSettings } from "@/components/settings/use-profile-settings";

const timezones = [
  "Asia/Manila",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function AccountSettings({
  email,
  preview,
}: {
  email: string;
  preview: boolean;
}) {
  const {
    settings,
    setSettings,
    saved,
    loading,
    saving,
    error,
    notice,
    save,
    reset,
  } = useProfileSettings();
  const dirty =
    settings && saved && JSON.stringify(settings) !== JSON.stringify(saved);

  if (loading || !settings) return <SettingsSkeleton />;

  return (
    <div className="settings-content">
      <section className="settings-section" aria-labelledby="identity-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Identity</p>
            <h2 id="identity-title" className="section-title">
              Account details
            </h2>
            <p className="supporting-text">
              Used when friends search for you and in meeting invitations.
            </p>
          </div>
        </div>
        <div className="settings-form-grid">
          <label className="field-label">
            Full name
            <input
              className="field-control"
              value={settings.fullName}
              onChange={(event) =>
                setSettings({ ...settings, fullName: event.target.value })
              }
            />
          </label>
          <label className="field-label">
            Username
            <input
              className="field-control"
              value={settings.username}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  username: event.target.value.toLowerCase(),
                })
              }
            />
          </label>
          <label className="field-label sm:col-span-2">
            Email
            <input className="field-control" value={email} disabled />
            <span className="field-help">
              Email changes require account verification and are not available
              here yet.
            </span>
          </label>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="day-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Your day</p>
            <h2 id="day-title" className="section-title">
              Timezone and active hours
            </h2>
            <p className="supporting-text">
              Kairos uses these values for every schedule conversion and
              recommendation.
            </p>
          </div>
        </div>
        <div className="settings-form-grid">
          <label className="field-label sm:col-span-2">
            Timezone
            <select
              className="field-control"
              value={settings.timezone}
              onChange={(event) =>
                setSettings({ ...settings, timezone: event.target.value })
              }
            >
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Active from
            <input
              className="field-control"
              type="time"
              value={settings.activeStart}
              onChange={(event) =>
                setSettings({ ...settings, activeStart: event.target.value })
              }
            />
          </label>
          <label className="field-label">
            Active until
            <input
              className="field-control"
              type="time"
              value={settings.activeEnd}
              onChange={(event) =>
                setSettings({ ...settings, activeEnd: event.target.value })
              }
            />
          </label>
          <label className="field-label sm:col-span-2">
            Default travel buffer
            <input
              className="field-control"
              type="number"
              min={0}
              max={120}
              step={5}
              value={settings.travelBufferMinutes}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  travelBufferMinutes: Number(event.target.value),
                })
              }
            />
            <span className="field-help">
              Minutes added before a journey when travel time is unavailable.
            </span>
          </label>
        </div>
      </section>

      <SettingsFeedback error={error} notice={notice} />
      <div className="settings-action-bar">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={reset}
          className="btn btn-ghost min-h-11 px-4"
        >
          <RotateCcw className="size-4" />
          Cancel
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="btn btn-primary min-h-11 px-5"
        >
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save changes
        </button>
      </div>

      <section className="settings-section" aria-labelledby="session-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Session</p>
            <h2 id="session-title" className="section-title">
              Account access
            </h2>
          </div>
          {preview ? (
            <a href="/auth" className="btn btn-outline min-h-11 px-4 text-sm">
              Configure Supabase
            </a>
          ) : (
            <form action={signOut}>
              <button
                type="submit"
                className="btn btn-outline min-h-11 px-4 text-sm"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div
      className="settings-content"
      role="status"
      aria-label="Loading account settings"
    >
      <div className="settings-section grid gap-3">
        <div className="skeleton h-6 w-48 rounded" />
        <div className="skeleton h-11 rounded-xl" />
        <div className="skeleton h-11 rounded-xl" />
      </div>
    </div>
  );
}
