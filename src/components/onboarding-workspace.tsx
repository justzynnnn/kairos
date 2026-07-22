"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { SettingsFeedback } from "@/components/settings/settings-feedback";
import { useProfileSettings } from "@/components/settings/use-profile-settings";
import type { ScheduleVisibility } from "@/lib/profile/types";

const timezones = [
  "Asia/Manila",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const visibility: Array<{
  value: ScheduleVisibility;
  label: string;
  detail: string;
}> = [
  { value: "private", label: "Private", detail: "Only you" },
  { value: "friends", label: "Friends", detail: "Accepted friends" },
  { value: "public", label: "Kairos users", detail: "Signed-in users" },
];

export function OnboardingWorkspace() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [command, setCommand] = useState("");
  const { settings, setSettings, loading, saving, error, save } =
    useProfileSettings();

  if (loading || !settings)
    return (
      <div className="empty-state raised-panel min-h-72" role="status">
        <LoaderCircle className="size-6 animate-spin" />
        <p>Preparing your private workspace…</p>
      </div>
    );

  async function continueToFirstItem() {
    if (!settings) return;
    if (!(await save(settings, "Your scheduling rules are saved."))) return;
    setStep(3);
  }

  function finish() {
    const value = command.trim();
    if (!value) return;
    router.push(`/assistant?command=${encodeURIComponent(value)}` as Route);
  }

  return (
    <section className="onboarding-panel raised-panel" aria-label="Onboarding">
      <ol className="onboarding-progress" aria-label="Setup progress">
        {["Your day", "Privacy", "First item"].map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} aria-current={step === number ? "step" : undefined}>
              <span>
                {number < step ? <Check className="size-3" /> : number}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="onboarding-step">
          <p className="eyebrow">Step 1 of 3</p>
          <h2 className="section-title">When does your day happen?</h2>
          <p className="supporting-text">
            Every suggestion and time conversion uses these explicit values.
          </p>
          <div className="settings-form-grid mt-5">
            <label className="field-label sm:col-span-2">
              Timezone
              <select
                className="field-control"
                value={settings.timezone}
                onChange={(event) =>
                  setSettings({ ...settings, timezone: event.target.value })
                }
              >
                {timezones.map((timezone) => (
                  <option key={timezone}>{timezone}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Active from
              <input
                type="time"
                className="field-control"
                value={settings.activeStart}
                onChange={(event) =>
                  setSettings({ ...settings, activeStart: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              Active until
              <input
                type="time"
                className="field-control"
                value={settings.activeEnd}
                onChange={(event) =>
                  setSettings({ ...settings, activeEnd: event.target.value })
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="btn btn-primary mt-6 min-h-11 px-5"
          >
            Continue <ArrowRight className="size-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-step">
          <p className="eyebrow">Step 2 of 3</p>
          <h2 className="section-title">Choose one availability rule</h2>
          <p className="supporting-text">
            Only sanitized free/busy intervals can be shared. Private event
            details never leave your account.
          </p>
          <fieldset className="privacy-options mt-5">
            <legend className="sr-only">Schedule visibility</legend>
            {visibility.map((option) => (
              <label key={option.value} className="privacy-option">
                <input
                  type="radio"
                  name="onboarding-visibility"
                  checked={settings.scheduleVisibility === option.value}
                  onChange={() =>
                    setSettings({
                      ...settings,
                      scheduleVisibility: option.value,
                    })
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <SettingsFeedback error={error} notice={null} />
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn btn-ghost min-h-11 px-4"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void continueToFirstItem()}
              className="btn btn-primary min-h-11 px-5"
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              Save and continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-step">
          <p className="eyebrow">Step 3 of 3</p>
          <h2 className="section-title">Plan your first item</h2>
          <p className="supporting-text">
            Describe the outcome naturally. Kairos will show assumptions and
            conflicts before anything reaches your calendar.
          </p>
          <label className="field-label mt-5">
            What needs to happen?
            <textarea
              className="field-control min-h-28 resize-y py-3"
              placeholder="Prepare the project brief for 90 minutes before Friday at 4 PM"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={command.trim().length < 3}
            onClick={finish}
            className="btn btn-primary mt-6 min-h-11 px-5"
          >
            Review in Assistant <ArrowRight className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}
