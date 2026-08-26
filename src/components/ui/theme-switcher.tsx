"use client";

import * as React from "react";

import {
  isThemePreference,
  SYSTEM_THEME_QUERY,
  THEME_EVENT,
  THEME_KEY,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme";
import {
  applyStoredTheme,
  getStoredTheme,
  setThemePreference,
} from "@/lib/theme-client";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

const labels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function getSnapshot(): ThemePreference {
  const fromDocument = document.documentElement.dataset.theme;
  return isThemePreference(fromDocument) ? fromDocument : getStoredTheme();
}

const getServerSnapshot = (): ThemePreference => "system";

function subscribe(onStoreChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  const media = window.matchMedia(SYSTEM_THEME_QUERY);

  const handleMediaChange = () => {
    if (getStoredTheme() === "system") {
      applyStoredTheme();
      onStoreChange();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      applyStoredTheme();
      onStoreChange();
    }
  };

  observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
  media.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

type ThemeSwitcherProps = Omit<React.ComponentProps<typeof SegmentedControl>, "onChange"> & {
  onValueChange?: (preference: ThemePreference) => void;
};

function ThemeSwitcher({ className, onValueChange, ...props }: ThemeSwitcherProps) {
  const preference = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <SegmentedControl
      aria-label="Select a display theme"
      className={cn("shrink-0", className)}
      {...props}
    >
      {THEME_PREFERENCES.map((option) => (
        <SegmentedControlItem
          key={option}
          selected={preference === option}
          aria-label={`${labels[option]} theme`}
          onClick={() => {
            setThemePreference(option);
            onValueChange?.(option);
          }}
        >
          {labels[option]}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

export { ThemeSwitcher, type ThemeSwitcherProps };
