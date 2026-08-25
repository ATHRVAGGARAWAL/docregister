"use client";

import { useEffect, useLayoutEffect } from "react";

import { applyStoredTheme } from "@/lib/theme";

/**
 * Restores the theme class that React clears on its development remount.
 *
 * Strict Mode remounts once in development and resets `<html>` to only the
 * attributes it manages from JSX, which drops the class the root layout's
 * blocking script set during parsing. Production never sees this; `next dev`
 * sees it on every page load, which is enough to make dark mode look broken
 * for the entire time anyone is working on the app.
 *
 * This lives in the root layout rather than inside `ThemeToggle`, where the
 * Next.js guide puts it, because the toggle only renders on the dashboard —
 * `/login` is the first screen a doctor sees and has no toggle on it, so the
 * fix has to sit above both routes to cover either one.
 *
 * Renders nothing.
 */

// `useLayoutEffect` runs before paint, which is the entire point — a `useEffect`
// would restore the theme one frame after the browser had already shown the
// wrong one, turning a missing theme into a flashing one. React logs a warning
// when it is called during a server render, though, so the server side of the
// SSR pass gets the effect that does nothing there anyway.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ThemeSync() {
  useBeforePaint(() => {
    applyStoredTheme();
  }, []);

  return null;
}
