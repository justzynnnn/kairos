"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileSettings } from "@/lib/profile/types";

export function useProfileSettings() {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [saved, setSaved] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/settings", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSettings(data.settings);
        setSaved(data.settings);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Settings could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const save = useCallback(
    async (next?: ProfileSettings, message = "Settings saved.") => {
      const value = next ?? settings;
      if (!value) return false;
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/profile/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (mounted.current) {
          setSettings(data.settings);
          setSaved(data.settings);
          setNotice(message);
        }
        return true;
      } catch (reason) {
        if (mounted.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Settings could not be saved.",
          );
        return false;
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [settings],
  );

  const reset = useCallback(() => {
    if (saved) setSettings(saved);
    setError(null);
    setNotice(null);
  }, [saved]);

  return {
    settings,
    setSettings,
    saved,
    loading,
    saving,
    error,
    notice,
    setError,
    setNotice,
    save,
    reset,
  };
}
