"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { THEME_KEY } from "@/lib/theme";

/**
 * Light / dark toggle.
 *
 * Hand-rolled rather than `next-themes`, because the whole requirement is one
 * class on `<html>` and one key in `localStorage`, and the no-flash half of the
 * job is done by the blocking script in the root layout regardless of which
 * library owns the toggle.
 *
 * Both themes are real here: the deep clinical workspace is the product
 * default, with a bright glass option for sunlit rooms. Neither is a token
 * inversion of the other; their depth values are tuned separately.
 *
 * The current theme is read with `useSyncExternalStore` rather than mirrored
 * into state from an effect. `<html class="dark">` genuinely is external state
 * — the layout's blocking script sets it before React exists — so this
 * subscribes to it instead of guessing on first render and correcting afterwards.
 */

/** Re-read whenever anything touches the class list on `<html>`. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

// The product defaults to its deep clinical theme until a doctor explicitly
// saves the bright theme, so the server snapshot mirrors that first paint.
const isDarkOnServer = () => true;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, isDarkOnServer);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    // The class *is* the state, so it is written first and the store reacts.
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Private mode, or storage disabled. The toggle still works for this
      // session; it just will not be remembered.
    }
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="border-border/50 bg-card/25"
    >
      <SunIcon className="size-4 dark:hidden" aria-hidden />
      <MoonIcon className="hidden size-4 dark:block" aria-hidden />
    </Button>
  );
}
