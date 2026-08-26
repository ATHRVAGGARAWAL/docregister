"use client";

import * as React from "react";

import {
  isThemePreference,
  SYSTEM_THEME_QUERY,
  THEME_EVENT,
  THEME_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";
import { applyStoredTheme, getStoredTheme, setThemePreference } from "@/lib/theme-client";

/**
 * Read the theme from anywhere, with no provider to mount.
 *
 * The store is `<html>` itself — the blocking script in the root layout has
 * already written the class, `data-theme` and `color-scheme` onto it before the
 * first paint, so a React context wrapping the tree would be a second, later
 * copy of state that is already authoritative. It would also have to be mounted
 * in `src/app/layout.tsx` to be reachable from `/login` as well as the
 * dashboard, and a hook that works without touching the layout is a hook that
 * cannot be half-wired.
 */

export interface ThemeState {
  /** What the doctor chose: `system`, `light` or `dark`. */
  preference: ThemePreference;
  /** What is actually painted right now. `system` has already been resolved. */
  resolved: ResolvedTheme;
  /** What `system` currently resolves to, so a control can say so. */
  systemPrefersDark: boolean;
  /**
   * False on the server and through the hydration pass, when the real theme is
   * not knowable. Branch on it before rendering anything theme-specific:
   * without it a dark page renders one light-flavoured frame.
   */
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * One string, because `useSyncExternalStore` compares snapshots by identity and
 * a fresh object every call is an infinite render loop.
 */
function getSnapshot(): string {
  const root = document.documentElement;
  const raw = root.dataset.theme;
  const preference = isThemePreference(raw) ? raw : getStoredTheme();
  const resolved: ResolvedTheme = root.classList.contains("dark") ? "dark" : "light";
  const systemDark = window.matchMedia(SYSTEM_THEME_QUERY).matches;
  return `${preference}:${resolved}:${systemDark ? "1" : "0"}`;
}

/**
 * The server renders the light palette, because it has no way to know the OS
 * preference and the stylesheet's `:root` is light. React swaps to the client
 * snapshot in a post-hydration pass rather than treating the difference as a
 * mismatch, which is exactly what this hook wants.
 */
const SERVER_SNAPSHOT = "system:light:0";

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia(SYSTEM_THEME_QUERY);

  // The class is written by four different things — the blocking script,
  // `ThemeSync`, this hook's setter, and another tab through `storage` — so the
  // element is watched rather than any one of those writers being trusted.
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  const onSystemChange = () => {
    if (getStoredTheme() === "system") applyStoredTheme();
    // Still notify on an explicit light/dark preference: `systemPrefersDark` is
    // part of the snapshot, and a control that reports what "System" would do
    // has to update even when System is not the current choice.
    onStoreChange();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    applyStoredTheme();
    onStoreChange();
  };

  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

const NEVER_CHANGES = () => () => {};
const ON_CLIENT = () => true;
const ON_SERVER = () => false;

export function useTheme(): ThemeState {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const ready = React.useSyncExternalStore(NEVER_CHANGES, ON_CLIENT, ON_SERVER);

  return React.useMemo(() => {
    const [preference, resolved, systemDark] = snapshot.split(":");
    return {
      preference: isThemePreference(preference) ? preference : "system",
      resolved: resolved === "dark" ? "dark" : "light",
      systemPrefersDark: systemDark === "1",
      ready,
      setPreference: setThemePreference,
    };
  }, [snapshot, ready]);
}
