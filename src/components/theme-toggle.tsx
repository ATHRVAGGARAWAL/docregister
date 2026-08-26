"use client";

import { ThemeSwitcher, type ThemeSwitcherProps } from "@/components/ui/theme-switcher";

/** Backwards-compatible product-level name for the shared three-mode control. */
export function ThemeToggle(props: ThemeSwitcherProps) {
  return <ThemeSwitcher {...props} />;
}
