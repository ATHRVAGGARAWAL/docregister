/**
 * Theme resolution, in the two forms it has to exist in.
 *
 * `THEME_SCRIPT` runs during HTML parsing, before React exists and before the
 * first paint — that is the only place a theme can be applied without a flash.
 * `applyStoredTheme` is the same rule expressed in TypeScript, for the one case
 * the script cannot cover.
 *
 * They are kept in this file, adjacent, precisely because they duplicate each
 * other: a change to one that is not made to the other is a bug that only shows
 * up as a flash of the wrong theme on a real device.
 */

/** Where the preference lives. Read by both forms below. */
export const THEME_KEY = "theme";

/**
 * The rule: an explicit light choice wins; otherwise use the product's
 * signature deep clinical theme. Doctors can still choose the bright glass
 * theme explicitly from the toggle.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"){document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})()`;

/**
 * The same rule, re-applied from the client.
 *
 * Needed because React's Strict Mode remounts once in development and, on that
 * remount, resets `<html>` to only the attributes it manages from JSX — which
 * wipes the class the inline script set. Without this, `next dev` renders every
 * page in light mode for a doctor who chose dark, and the bug never reproduces
 * in a production build. It is a no-op in production, where the class the
 * script set is still there.
 */
export function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    const dark = stored !== "light";
    document.documentElement.classList.toggle("dark", dark);
  } catch {
    // Storage unavailable. Keep the signature dark theme.
    document.documentElement.classList.add("dark");
  }
}
