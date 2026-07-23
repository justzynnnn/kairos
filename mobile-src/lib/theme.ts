export type ThemePreference = "system" | "light" | "dark";

// Plain localStorage rather than the secure store: this is a display setting,
// not account data, and it has to be readable synchronously before the first
// paint. The store's native plugin is async and would flash the wrong palette.
const storageKey = "kairos.mobile.theme";

export function storedTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" || value === "system"
      ? value
      : "system";
  } catch {
    return "system";
  }
}

/**
 * `system` leaves the root untouched so the prefers-color-scheme block decides;
 * anything else pins the palette with data-theme.
 */
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    // A phone that refuses storage still gets the theme for this session.
  }
}

export function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(preference: ThemePreference) {
  return preference === "system"
    ? systemPrefersDark()
      ? "dark"
      : "light"
    : preference;
}

/** The next value in the Light → Dark → System cycle. */
export function nextTheme(preference: ThemePreference): ThemePreference {
  return preference === "system"
    ? systemPrefersDark()
      ? "light"
      : "dark"
    : preference === "dark"
      ? "light"
      : "system";
}
