import { useEffect, useState, type FormEvent } from "react";
import type {
  MobileSettingsPayload,
  ProfileSettings,
} from "@/lib/mobile/contracts-types";
import { NativeSpeech } from "@/lib/mobile/native";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { openAssistantWith } from "../lib/draft";
import { Check, Mic, Sparkles } from "../lib/icons";

const timezones = [
  "Asia/Manila",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const steps = ["Welcome", "Your day", "Voice", "First item"] as const;

export default function Onboarding({ onFinish }: { onFinish(): void }) {
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micState, setMicState] = useState<"idle" | "asking" | "granted">(
    "idle",
  );

  useEffect(() => {
    if (!auth.accessToken) return;
    void apiRequest<MobileSettingsPayload>(
      "/api/mobile/settings",
      auth.accessToken,
    )
      .then((payload) => setSettings(payload.settings))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Your account could not be loaded.",
        ),
      );
  }, [auth.accessToken]);

  async function saveDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !auth.accessToken) return;
    const form = new FormData(event.currentTarget);
    const next: ProfileSettings = {
      ...settings,
      timezone: String(form.get("timezone")),
      activeStart: String(form.get("activeStart")),
      activeEnd: String(form.get("activeEnd")),
    };
    setBusy(true);
    setError(null);
    try {
      const payload = await apiRequest<MobileSettingsPayload>(
        "/api/mobile/settings",
        auth.accessToken,
        { method: "PUT", body: JSON.stringify(next) },
      );
      setSettings(payload.settings);
      setStep(2);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Those hours could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  // The OS prompt only appears once per install, so it is spent deliberately:
  // the primer explains what it is for, and only a tap starts a throwaway
  // session to trigger it.
  async function askForMicrophone() {
    setMicState("asking");
    setError(null);
    try {
      await NativeSpeech.start();
      await NativeSpeech.cancel();
      setMicState("granted");
    } catch (reason) {
      setMicState("idle");
      setError(
        reason instanceof Error
          ? reason.message
          : "Dictation is unavailable on this phone. You can still type.",
      );
    }
  }

  function finish(draft?: string) {
    onFinish();
    if (draft && draft.trim().length >= 2)
      openAssistantWith({ text: draft.trim(), submitted: true, record: false });
  }

  return (
    <main className="page">
      <ol className="onboarding-progress" aria-label="Setup progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined}>
            <span>
              {index < step ? (
                <Check size={12} strokeWidth={3} aria-hidden />
              ) : (
                index + 1
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <section className="panel panel-pad page">
          <div>
            <p className="eyebrow">Welcome</p>
            <h1>Mori protects your time</h1>
            <p className="supporting">
              Tell it what needs to happen. It proposes, you confirm — nothing
              reaches your schedule on its own.
            </p>
          </div>
          <button
            className="primary full"
            type="button"
            onClick={() => setStep(1)}
          >
            Set up
          </button>
          <button
            className="secondary full"
            type="button"
            onClick={() => finish()}
          >
            Skip setup
          </button>
        </section>
      )}

      {step === 1 &&
        (settings ? (
          <form className="panel panel-pad page" onSubmit={saveDay}>
            <div>
              <p className="eyebrow">Step 2 of 4</p>
              <h1>When does your day happen?</h1>
              <p className="supporting">
                Every suggestion and time conversion uses these values.
              </p>
            </div>
            <label className="field">
              Timezone
              <select name="timezone" defaultValue={settings.timezone}>
                {(timezones.includes(settings.timezone)
                  ? timezones
                  : [settings.timezone, ...timezones]
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Active from
              <input
                name="activeStart"
                type="time"
                defaultValue={settings.activeStart}
                required
              />
            </label>
            <label className="field">
              Active until
              <input
                name="activeEnd"
                type="time"
                defaultValue={settings.activeEnd}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
            <button
              className="secondary full"
              type="button"
              onClick={() => setStep(2)}
            >
              Skip
            </button>
          </form>
        ) : (
          <div className="skeleton" />
        ))}

      {step === 2 && (
        <section className="panel panel-pad page">
          <div>
            <p className="eyebrow">Step 3 of 4</p>
            <h1>Dictation stays on this phone</h1>
            <p className="supporting">
              Mori transcribes on device and shows the words before anything
              is planned. iOS will ask for the microphone and speech recognition
              when you tap below.
            </p>
          </div>
          {micState === "granted" ? (
            <div className="success">Dictation is ready.</div>
          ) : (
            <button
              className="primary full"
              type="button"
              disabled={micState === "asking"}
              onClick={() => void askForMicrophone()}
            >
              <Mic size={18} strokeWidth={2.5} aria-hidden />
              {micState === "asking" ? "Waiting…" : "Allow dictation"}
            </button>
          )}
          <button
            className="secondary full"
            type="button"
            onClick={() => setStep(3)}
          >
            {micState === "granted" ? "Continue" : "Not now"}
          </button>
        </section>
      )}

      {step === 3 && (
        <form
          className="panel panel-pad page"
          onSubmit={(event) => {
            event.preventDefault();
            finish(
              String(new FormData(event.currentTarget).get("command") ?? ""),
            );
          }}
        >
          <div>
            <p className="eyebrow">Step 4 of 4</p>
            <h1>Plan your first item</h1>
            <p className="supporting">
              Describe it naturally. Mori shows its assumptions and any
              conflict before you confirm.
            </p>
          </div>
          <label className="field">
            What needs to happen?
            <textarea
              name="command"
              maxLength={2_000}
              placeholder="Block two hours for my report before Friday"
            />
          </label>
          <button className="primary full">
            <Sparkles size={18} strokeWidth={2.5} aria-hidden />
            Review proposal
          </button>
          <button
            className="secondary full"
            type="button"
            onClick={() => finish()}
          >
            Start from Home
          </button>
        </form>
      )}
    </main>
  );
}
