import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  EditablePreference,
  MobilePreferencePayload,
  MobilePreferencesPayload,
  MobileSettingsPayload,
  ProfileSettings,
  ScheduleVisibility,
} from "@/lib/mobile/contracts-types";
import {
  pendingLocalOperations,
  readLocalSnapshot,
  writeLocalSnapshot,
} from "@/lib/mobile/store";
import Sheet from "../components/sheet";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMobileData } from "../lib/data";
import { ChevronRight, Plus, RefreshCw, Trash2 } from "../lib/icons";
import { setDiagnosticsEnabled } from "../lib/metrics";

const timezones = [
  "Asia/Manila",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
];

type AccountField =
  | "fullName"
  | "username"
  | "timezone"
  | "hours"
  | "travelBuffer";

const accountSheets: Record<
  AccountField,
  { title: string; description: string }
> = {
  fullName: {
    title: "Full name",
    description: "Shown to friends who search for you and on invitations.",
  },
  username: {
    title: "Username",
    description: "3–32 letters, numbers, or underscores. Must be unique.",
  },
  timezone: {
    title: "Timezone",
    description: "Every schedule conversion on this phone uses this zone.",
  },
  hours: {
    title: "Active hours",
    description: "Mori only places flexible work inside this window.",
  },
  travelBuffer: {
    title: "Travel buffer",
    description: "Minutes added before a journey when travel time is unknown.",
  },
};

const visibilityOptions: Array<{
  value: ScheduleVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only you can inspect your availability.",
  },
  {
    value: "friends",
    label: "Friends",
    description: "Accepted friends see sanitized free/busy intervals.",
  },
  {
    value: "public",
    label: "Mori users",
    description: "Any signed-in Mori user sees sanitized free/busy.",
  },
];

const automationRows: Array<{
  key: "automationReminders" | "automationLateness";
  label: string;
  description: string;
}> = [
  {
    key: "automationReminders",
    label: "Schedule reminders",
    description: "Create private reminders near an upcoming event.",
  },
  {
    key: "automationLateness",
    label: "Possible lateness notices",
    description: "Prepare a private warning when your schedule slips.",
  },
];

type CachedProfile = {
  settings: ProfileSettings;
  preferences: EditablePreference[];
};

// Settings is the one tab that writes profile state, so it watches connectivity
// itself rather than inferring it from the schedule sync: a bootstrap that
// failed and a phone in a lift both have to close the same editors.
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export default function Profile() {
  const auth = useAuth();
  const { data, state, refresh } = useMobileData();
  const online = useOnline();
  const offline = !online || state === "offline";
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [preferences, setPreferences] = useState<EditablePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountField | null>(null);
  const [preferenceDraft, setPreferenceDraft] = useState<
    EditablePreference | "new" | null
  >(null);
  const [pending, setPending] = useState(0);
  const [diagnostics, setDiagnostics] = useState(false);
  const cacheKey = auth.user ? "profile:" + auth.user.id : "profile";

  const persist = useCallback(
    (value: CachedProfile) => void writeLocalSnapshot(cacheKey, value),
    [cacheKey],
  );

  const load = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      const [settingsPayload, preferencePayload] = await Promise.all([
        apiRequest<MobileSettingsPayload>(
          "/api/mobile/settings",
          auth.accessToken,
        ),
        apiRequest<MobilePreferencesPayload>(
          "/api/mobile/preferences",
          auth.accessToken,
        ),
      ]);
      setSettings(settingsPayload.settings);
      setPreferences(preferencePayload.preferences);
      setError(null);
      persist({
        settings: settingsPayload.settings,
        preferences: preferencePayload.preferences,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, persist]);

  // Paint the last known profile, then reconcile — the contract the schedule
  // already keeps, so opening Settings offline still shows real values.
  useEffect(() => {
    let active = true;
    void readLocalSnapshot<CachedProfile>(cacheKey).then((cached) => {
      if (!active) return;
      if (cached?.settings) {
        setSettings(cached.settings);
        setPreferences(cached.preferences ?? []);
        setLoading(false);
      }
      void load();
    });
    return () => {
      active = false;
    };
  }, [cacheKey, load]);

  useEffect(() => {
    void readLocalSnapshot<boolean>("diagnostics-enabled").then((value) =>
      setDiagnostics(value ?? false),
    );
  }, []);

  const countPending = useCallback(
    () => pendingLocalOperations().then((entries) => entries.length),
    [],
  );
  // Recounted whenever the sync state settles, which is when the queue can
  // have changed under this page.
  useEffect(() => {
    void countPending().then(setPending);
  }, [countPending, state]);

  function fail(reason: unknown, fallback: string, inSheet: boolean) {
    const message = reason instanceof Error ? reason.message : fallback;
    if (inSheet) setSheetError(message);
    else setError(message);
    return false;
  }

  // `fromAccountSheet` marks the one path that edits viewer fields: it decides
  // both where a server message is shown and whether the rest of the app has to
  // be refreshed.
  async function saveSettings(
    next: ProfileSettings,
    message: string,
    fromAccountSheet = false,
  ) {
    if (!auth.accessToken) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSheetError(null);
    try {
      const payload = await apiRequest<MobileSettingsPayload>(
        "/api/mobile/settings",
        auth.accessToken,
        { method: "PUT", body: JSON.stringify(next) },
      );
      setSettings(payload.settings);
      persist({ settings: payload.settings, preferences });
      setNotice(message);
      // Name, username, timezone, active hours, and travel buffer are viewer
      // fields every other tab renders from the bootstrap payload.
      if (fromAccountSheet) void refresh();
      return true;
    } catch (reason) {
      return fail(reason, "Settings could not be saved.", fromAccountSheet);
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount(field: AccountField, form: FormData) {
    if (!settings) return;
    const next: ProfileSettings = { ...settings };
    if (field === "fullName")
      next.fullName = String(form.get("fullName") ?? "").trim();
    if (field === "username")
      next.username = String(form.get("username") ?? "")
        .trim()
        .toLowerCase();
    if (field === "timezone") next.timezone = String(form.get("timezone"));
    if (field === "hours") {
      next.activeStart = String(form.get("activeStart"));
      next.activeEnd = String(form.get("activeEnd"));
    }
    if (field === "travelBuffer")
      next.travelBufferMinutes = Number(form.get("travelBufferMinutes"));
    if (await saveSettings(next, "Account updated.", true)) setEditing(null);
  }

  async function submitPreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.accessToken || !preferenceDraft) return;
    const form = new FormData(event.currentTarget);
    const duration = String(form.get("defaultDurationMinutes") ?? "").trim();
    const flexibility = String(form.get("flexibility") ?? "");
    const value = {
      category: String(form.get("category") ?? "").trim(),
      defaultDurationMinutes: duration ? Number(duration) : null,
      flexibility: (flexibility || null) as EditablePreference["flexibility"],
      canShorten: form.get("canShorten") === "on",
      canSplit: form.get("canSplit") === "on",
      canSkip: form.get("canSkip") === "on",
    };
    const existing = preferenceDraft === "new" ? null : preferenceDraft;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSheetError(null);
    try {
      const payload = await apiRequest<MobilePreferencePayload>(
        existing
          ? "/api/mobile/preferences/" + existing.id
          : "/api/mobile/preferences",
        auth.accessToken,
        { method: existing ? "PATCH" : "POST", body: JSON.stringify(value) },
      );
      const next = existing
        ? preferences.map((entry) =>
            entry.id === existing.id ? payload.preference : entry,
          )
        : [...preferences, payload.preference];
      setPreferences(next);
      if (settings) persist({ settings, preferences: next });
      setNotice(payload.preference.category + " saved.");
      setPreferenceDraft(null);
    } catch (reason) {
      fail(reason, "Preference could not be saved.", true);
    } finally {
      setBusy(false);
    }
  }

  async function deletePreference(preference: EditablePreference) {
    if (!auth.accessToken) return;
    setBusy(true);
    setSheetError(null);
    try {
      await apiRequest<{ ok: boolean }>(
        "/api/mobile/preferences/" + preference.id,
        auth.accessToken,
        { method: "DELETE" },
      );
      const next = preferences.filter((entry) => entry.id !== preference.id);
      setPreferences(next);
      if (settings) persist({ settings, preferences: next });
      setNotice(preference.category + " removed.");
      setPreferenceDraft(null);
    } catch (reason) {
      fail(reason, "Preference could not be removed.", true);
    } finally {
      setBusy(false);
    }
  }

  // Switches and radios move immediately and are put back if the server
  // refuses, so the control never sits in a state the profile does not hold.
  function applySettings(next: ProfileSettings, message: string) {
    const previous = settings;
    setSettings(next);
    void saveSettings(next, message).then((saved) => {
      if (!saved && previous) setSettings(previous);
    });
  }

  function toggle(
    key:
      | "locationEnabled"
      | "activityAggregateSharing"
      | "automationReminders"
      | "automationLateness",
    enabled: boolean,
    message: string,
  ) {
    if (!settings) return;
    applySettings({ ...settings, [key]: enabled }, message);
  }

  function closeSheets() {
    setEditing(null);
    setPreferenceDraft(null);
    setSheetError(null);
  }

  // A save in flight owns the sheet: closing it from the backdrop or Escape
  // would leave the server's answer with nowhere to be shown.
  function dismissSheet() {
    if (!busy) closeSheets();
  }

  if (!data) return null;
  const draft = preferenceDraft === "new" ? null : preferenceDraft;

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Signed in</p>
        <h1>Settings</h1>
        <p className="supporting">{data.viewer.email}</p>
      </header>

      {offline && (
        <div className="notice" role="status">
          Offline. Showing the last sync; changes resume when you reconnect.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      {loading && !settings ? (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      ) : settings ? (
        <>
          <section className="panel panel-pad">
            <div className="section-head">
              <h2>Account</h2>
            </div>
            <div className="list">
              {(
                [
                  ["fullName", "Full name", settings.fullName],
                  ["username", "Username", "@" + settings.username],
                  ["timezone", "Timezone", settings.timezone],
                  [
                    "hours",
                    "Active hours",
                    settings.activeStart + " – " + settings.activeEnd,
                  ],
                  [
                    "travelBuffer",
                    "Travel buffer",
                    settings.travelBufferMinutes + " min",
                  ],
                ] as Array<[AccountField, string, string]>
              ).map(([field, label, value]) => (
                <button
                  key={field}
                  type="button"
                  className="row settings-row"
                  disabled={offline}
                  onClick={() => {
                    setSheetError(null);
                    setEditing(field);
                  }}
                >
                  <p className="row-title">{label}</p>
                  <span className="row-value">
                    {value}
                    <ChevronRight size={16} strokeWidth={2.5} aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="section-head">
              <h2>Privacy</h2>
              <p className="supporting">
                Availability only — never titles, locations, or notes.
              </p>
            </div>
            <fieldset
              className="list"
              style={{ border: 0, margin: 0, padding: 0 }}
            >
              <legend className="eyebrow">Who can see your availability</legend>
              {visibilityOptions.map((option) => (
                <label key={option.value} className="row settings-row">
                  <div>
                    <p className="row-title">{option.label}</p>
                    <p className="row-meta">{option.description}</p>
                  </div>
                  <input
                    type="radio"
                    name="schedule-visibility"
                    value={option.value}
                    disabled={offline || busy}
                    checked={settings.scheduleVisibility === option.value}
                    onChange={() =>
                      applySettings(
                        { ...settings, scheduleVisibility: option.value },
                        "Schedule visibility updated.",
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
            <label className="row settings-row">
              <div>
                <p className="row-title">Share activity totals</p>
                <p className="row-meta">
                  Friends may see aggregate counts and streaks, never individual
                  titles or timestamps.
                </p>
              </div>
              <input
                type="checkbox"
                disabled={offline || busy}
                checked={settings.activityAggregateSharing}
                onChange={(event) =>
                  toggle(
                    "activityAggregateSharing",
                    event.target.checked,
                    "Activity sharing updated.",
                  )
                }
              />
            </label>
            <label className="row settings-row">
              <div>
                <p className="row-title">Location for Journey Mode</p>
                <p className="row-meta">
                  Foreground location only, and only while you actively run a
                  journey.
                </p>
              </div>
              <input
                type="checkbox"
                disabled={offline || busy}
                checked={settings.locationEnabled}
                onChange={(event) =>
                  toggle(
                    "locationEnabled",
                    event.target.checked,
                    "Location setting updated.",
                  )
                }
              />
            </label>
          </section>

          <section className="panel panel-pad">
            <div className="section-head">
              <h2>Automation</h2>
            </div>
            <div className="list">
              {automationRows.map((row) => (
                <label key={row.key} className="row settings-row">
                  <div>
                    <p className="row-title">{row.label}</p>
                    <p className="row-meta">{row.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={offline || busy}
                    checked={settings[row.key]}
                    onChange={(event) =>
                      toggle(
                        row.key,
                        event.target.checked,
                        "Automation setting updated.",
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="section-head">
              <h2>Remembered preferences</h2>
            </div>
            <div className="list">
              {preferences.length ? (
                preferences.map((preference) => (
                  <button
                    key={preference.id}
                    type="button"
                    className="row settings-row"
                    disabled={offline}
                    onClick={() => {
                      setSheetError(null);
                      setPreferenceDraft(preference);
                    }}
                  >
                    <div>
                      <p className="row-title">{preference.category}</p>
                      <p className="row-meta">
                        {preference.defaultDurationMinutes
                          ? preference.defaultDurationMinutes + " min"
                          : "No default duration"}
                        {preference.flexibility
                          ? " · " + preference.flexibility
                          : ""}
                      </p>
                    </div>
                    <span className="row-value">
                      <ChevronRight size={16} strokeWidth={2.5} aria-hidden />
                    </span>
                  </button>
                ))
              ) : (
                <p className="supporting">Nothing remembered yet.</p>
              )}
            </div>
            <button
              type="button"
              className="secondary full"
              disabled={offline}
              onClick={() => {
                setSheetError(null);
                setPreferenceDraft("new");
              }}
            >
              <Plus size={18} strokeWidth={2.5} aria-hidden />
              Add preference
            </button>
          </section>
        </>
      ) : null}

      <section className="panel panel-pad">
        <div className="section-head">
          <p className="eyebrow">Sync</p>
          <h2>
            {pending
              ? pending === 1
                ? "1 change waiting to sync"
                : pending + " changes waiting to sync"
              : "Everything on this phone is synced"}
          </h2>
          <p className="supporting">
            Changes made offline apply here first. Anything that clashes with
            another device stops for review instead of overwriting it.
          </p>
        </div>
        <button
          type="button"
          className="secondary full"
          disabled={!online || state === "refreshing"}
          onClick={() => void refresh().then(countPending).then(setPending)}
        >
          <RefreshCw size={18} strokeWidth={2.5} aria-hidden />
          {state === "refreshing" ? "Syncing…" : "Sync now"}
        </button>
      </section>

      <section className="panel panel-pad">
        <p className="eyebrow">Diagnostics</p>
        <label className="row settings-row">
          <div>
            <p className="row-title">Share coarse performance metrics</p>
            <p className="row-meta">
              Timings and error codes only — never prompts, titles, or messages.
            </p>
          </div>
          <input
            type="checkbox"
            checked={diagnostics}
            onChange={(event) => {
              const value = event.target.checked;
              setDiagnostics(value);
              setDiagnosticsEnabled(value);
              void writeLocalSnapshot("diagnostics-enabled", value);
            }}
          />
        </label>
      </section>

      <section className="panel panel-pad">
        <button className="danger full" onClick={() => void auth.signOut()}>
          Sign out and clear this phone
        </button>
      </section>

      {editing && settings && (
        <Sheet
          title={accountSheets[editing].title}
          description={accountSheets[editing].description}
          onDismiss={dismissSheet}
        >
          <form
            className="page"
            onSubmit={(event) => {
              event.preventDefault();
              void submitAccount(editing, new FormData(event.currentTarget));
            }}
          >
            {sheetError && <div className="error">{sheetError}</div>}
            {editing === "fullName" && (
              <label className="field">
                Full name
                <input
                  name="fullName"
                  defaultValue={settings.fullName}
                  maxLength={80}
                  required
                />
              </label>
            )}
            {editing === "username" && (
              <label className="field">
                Username
                <input
                  name="username"
                  defaultValue={settings.username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={32}
                  required
                />
              </label>
            )}
            {editing === "timezone" && (
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
            )}
            {editing === "hours" && (
              <>
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
              </>
            )}
            {editing === "travelBuffer" && (
              <label className="field">
                Travel buffer (minutes)
                <input
                  name="travelBufferMinutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  step={5}
                  defaultValue={settings.travelBufferMinutes}
                  required
                />
              </label>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={closeSheets}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {preferenceDraft && (
        <Sheet
          title={draft ? draft.category : "New preference"}
          description="Mori applies these defaults when it schedules this category."
          onDismiss={dismissSheet}
        >
          <form className="page" onSubmit={submitPreference}>
            {sheetError && <div className="error">{sheetError}</div>}
            <label className="field">
              Category
              <input
                name="category"
                defaultValue={draft?.category ?? ""}
                maxLength={60}
                required
              />
            </label>
            <label className="field">
              Default duration (minutes)
              <input
                name="defaultDurationMinutes"
                type="number"
                inputMode="numeric"
                min={15}
                max={1440}
                step={15}
                defaultValue={draft?.defaultDurationMinutes ?? ""}
              />
            </label>
            <label className="field">
              Flexibility
              <select
                name="flexibility"
                defaultValue={draft?.flexibility ?? ""}
              >
                <option value="">No default</option>
                <option value="fixed">Fixed</option>
                <option value="protected">Protected</option>
                <option value="flexible">Flexible</option>
              </select>
            </label>
            {(
              [
                ["canShorten", "May shorten"],
                ["canSplit", "May split"],
                ["canSkip", "May skip"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={draft?.[key] ?? false}
                />
                {label}
              </label>
            ))}
            <div className="actions">
              {draft && (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => void deletePreference(draft)}
                  style={{ marginRight: "auto" }}
                >
                  <Trash2 size={18} strokeWidth={2.5} aria-hidden />
                  Delete
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={closeSheets}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </main>
  );
}
