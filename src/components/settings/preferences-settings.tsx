"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { EditablePreference } from "@/lib/profile/types";

export function PreferencesSettings() {
  const [preferences, setPreferences] = useState<EditablePreference[]>([]);
  const [saved, setSaved] = useState<EditablePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditablePreference | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/profile/preferences");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPreferences(data.preferences ?? []);
      setSaved(data.preferences ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Preferences could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function update(id: string, patch: Partial<EditablePreference>) {
    setPreferences((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
    setNotice(null);
  }

  async function savePreference(preference: EditablePreference) {
    setBusyId(preference.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/profile/preferences/${preference.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: preference.category,
            defaultDurationMinutes: preference.defaultDurationMinutes,
            flexibility: preference.flexibility,
            canShorten: preference.canShorten,
            canSplit: preference.canSplit,
            canSkip: preference.canSkip,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSaved((current) =>
        current.map((entry) =>
          entry.id === preference.id ? data.preference : entry,
        ),
      );
      setPreferences((current) =>
        current.map((entry) =>
          entry.id === preference.id ? data.preference : entry,
        ),
      );
      setNotice(`${data.preference.category} saved.`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Preference could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deletePreference() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/profile/preferences/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPreferences((current) =>
        current.filter((entry) => entry.id !== deleteTarget.id),
      );
      setSaved((current) =>
        current.filter((entry) => entry.id !== deleteTarget.id),
      );
      setNotice(`${deleteTarget.category} removed.`);
      setDeleteTarget(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Preference could not be removed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="skeleton h-72 rounded-2xl" />;

  return (
    <div className="settings-content">
      <section className="settings-section" aria-labelledby="preferences-title">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Explicit learning only</p>
            <h2 id="preferences-title" className="section-title">
              Remembered preferences
            </h2>
            <p className="supporting-text">
              Kairos only stores defaults you deliberately asked it to remember.
            </p>
          </div>
        </div>
        {preferences.length ? (
          <div className="preference-list">
            {preferences.map((preference) => {
              const original = saved.find(
                (entry) => entry.id === preference.id,
              );
              const dirty =
                JSON.stringify(original) !== JSON.stringify(preference);
              return (
                <article key={preference.id} className="preference-editor">
                  <div className="settings-form-grid">
                    <label className="field-label">
                      Category
                      <input
                        className="field-control"
                        value={preference.category}
                        onChange={(event) =>
                          update(preference.id, {
                            category: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Default duration
                      <input
                        className="field-control"
                        type="number"
                        min={15}
                        max={1440}
                        step={15}
                        value={preference.defaultDurationMinutes ?? ""}
                        onChange={(event) =>
                          update(preference.id, {
                            defaultDurationMinutes: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label className="field-label sm:col-span-2">
                      Flexibility
                      <select
                        className="field-control"
                        value={preference.flexibility ?? ""}
                        onChange={(event) =>
                          update(preference.id, {
                            flexibility: (event.target.value ||
                              null) as EditablePreference["flexibility"],
                          })
                        }
                      >
                        <option value="">No default</option>
                        <option value="fixed">Fixed</option>
                        <option value="protected">Protected</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </label>
                  </div>
                  <div className="check-row">
                    {(
                      [
                        ["canShorten", "May shorten"],
                        ["canSplit", "May split"],
                        ["canSkip", "May skip"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={preference[key]}
                          onChange={(event) =>
                            update(preference.id, {
                              [key]: event.target.checked,
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="preference-actions">
                    <button
                      type="button"
                      className="btn btn-danger min-h-10 px-3 text-sm"
                      onClick={() => setDeleteTarget(preference)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </button>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        disabled={!dirty || busyId === preference.id}
                        onClick={() =>
                          original &&
                          setPreferences((current) =>
                            current.map((entry) =>
                              entry.id === preference.id ? original : entry,
                            ),
                          )
                        }
                        className="btn btn-ghost min-h-10 px-3 text-sm"
                      >
                        <RotateCcw className="size-4" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!dirty || busyId === preference.id}
                        onClick={() => void savePreference(preference)}
                        className="btn btn-primary min-h-10 px-4 text-sm"
                      >
                        {busyId === preference.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-row">
            No remembered preferences yet. Ask Kairos to remember a scheduling
            preference from the Assistant.
          </p>
        )}
      </section>
      {error && (
        <p className="inline-error" role="alert">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-success" role="status">
          <Check className="size-4" />
          {notice}
        </p>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.category ?? "preference"}?`}
        description="Kairos will stop applying this remembered default. This cannot be undone."
        confirmLabel="Delete preference"
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deletePreference()}
      />
    </div>
  );
}
