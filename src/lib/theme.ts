export const THEME_KEY = "theme";
export const THEME_EVENT = "docregister:theme-change";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return preference;
}

/**
 * Runs before hydration so the first rendered frame already matches the saved
 * preference. Missing or invalid storage deliberately resolves to the OS mode.
 */
export const THEME_SCRIPT = `(function(){var k="${THEME_KEY}",q="${SYSTEM_THEME_QUERY}",r=document.documentElement,m=window.matchMedia(q);function g(){try{var t=localStorage.getItem(k);return t==="light"||t==="dark"||t==="system"?t:"system"}catch(e){return "system"}}function a(){var t=g(),d=t==="dark"||(t==="system"&&m.matches);r.classList.toggle("dark",d);r.dataset.theme=t;r.style.colorScheme=d?"dark":"light"}a();var c=function(){if(g()==="system")a()};if(m.addEventListener)m.addEventListener("change",c);else if(m.addListener)m.addListener(c);window.addEventListener("storage",function(e){if(e.key===k)a()})})()`;
