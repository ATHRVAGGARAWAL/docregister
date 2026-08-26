"use client";

import {
  normalizeThemePreference,
  resolveTheme,
  SYSTEM_THEME_QUERY,
  THEME_EVENT,
  THEME_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

export function getStoredTheme(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, window.matchMedia(SYSTEM_THEME_QUERY).matches);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = preference;
  root.style.colorScheme = resolved;

  return resolved;
}

export function applyStoredTheme(): ResolvedTheme {
  return applyThemePreference(getStoredTheme());
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // The active tab can still honor the choice when storage is unavailable.
  }

  const resolved = applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preference, resolved } }));
  return resolved;
}
