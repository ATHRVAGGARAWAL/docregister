"use client";

import * as React from "react";

import { MoonIcon, SunIcon } from "@/components/icons";
import { createIcon } from "@/components/icons/icon-base";
import { useTheme } from "@/components/theme/use-theme";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Defined here rather than in `@/components/icons` only because that file
 * belongs to another change in flight; it is drawn with the same `createIcon`
 * factory, so it inherits the set's 24-unit box, 1.75 stroke and round joins.
 * Move it into the shared set when that file is free.
 */
const DisplayIcon = createIcon("DisplayIcon", [
  <rect key="screen" x={2.75} y={4} width={18.5} height={12.5} rx={2} />,
  <line key="stand" x1={9} y1={20} x2={15} y2={20} />,
  <line key="neck" x1={12} y1={16.5} x2={12} y2={20} />,
]);

const OPTIONS: Record<ThemePreference, { label: string; Icon: typeof MoonIcon }> = {
  system: { label: "System", Icon: DisplayIcon },
  light: { label: "Light", Icon: SunIcon },
  dark: { label: "Dark", Icon: MoonIcon },
};

export interface ThemeSwitcherProps
  extends Omit<React.ComponentProps<typeof SegmentedControl>, "onChange" | "children"> {
  /**
   * Hide the text and keep the icons. The accessible name is unchanged, so this
   * is a visual density choice and not an accessibility one.
   */
  compact?: boolean;
  /**
   * Named to match `@/components/ui/theme-switcher`, the control this one
   * supersedes, so swapping them is an import path and nothing else.
   */
  onValueChange?: (preference: ThemePreference) => void;
}

/**
 * The three-way display control: System, Light, Dark.
 *
 * `System` is a real third state rather than a starting value — a doctor whose
 * phone flips to dark at sunset gets the same flip here, and choosing Light or
 * Dark opts out of that until they choose System again.
 *
 * Keyboard behaviour follows the ARIA radio-group pattern rather than the
 * "every button is a tab stop" shape a row of buttons falls into by default:
 * one Tab reaches the group, arrows move within it, and Home/End jump to the
 * ends. Selection follows focus, which is what the pattern specifies for a
 * radio group and what makes the control usable without a second keystroke.
 */
export function ThemeSwitcher({
  className,
  compact = false,
  onValueChange,
  ...props
}: ThemeSwitcherProps) {
  const { preference, systemPrefersDark, setPreference } = useTheme();
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  // Empty until the doctor changes something: announcing the theme on every
  // page load would make a screen reader read the state of a control nobody
  // touched.
  const [spoken, setSpoken] = React.useState<{ id: number; text: string }>({ id: 0, text: "" });

  const choose = React.useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      onValueChange?.(next);
      const applied =
        next === "system"
          ? `Following your system theme, currently ${systemPrefersDark ? "dark" : "light"}.`
          : `${OPTIONS[next].label} theme applied.`;
      setSpoken((previous) => ({ id: previous.id + 1, text: applied }));
    },
    [onValueChange, setPreference, systemPrefersDark],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = THEME_PREFERENCES.length - 1;
    let target: number | null = null;

    // Both axes: the control is a horizontal row, but it sits inside a vertical
    // sidebar and a doctor reaching for Down is not making a mistake.
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = index === 0 ? last : index - 1;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = last;
    if (target === null) return;

    event.preventDefault();
    buttons.current[target]?.focus();
    choose(THEME_PREFERENCES[target]);
  };

  return (
    <>
      <SegmentedControl
        aria-label="Display theme"
        className={cn("shrink-0", className)}
        {...props}
      >
        {THEME_PREFERENCES.map((option, index) => {
          const { label, Icon } = OPTIONS[option];
          const selected = preference === option;
          const name =
            option === "system"
              ? `System theme, currently ${systemPrefersDark ? "dark" : "light"}`
              : `${label} theme`;

          return (
            <SegmentedControlItem
              key={option}
              ref={(node: HTMLButtonElement | null) => {
                buttons.current[index] = node;
              }}
              selected={selected}
              aria-label={name}
              // One tab stop for the whole group, per the radio-group pattern.
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => choose(option)}
              className={cn("gap-1.5", compact && "px-2.5 [@media(pointer:coarse)]:min-w-11")}
            >
              <Icon className="size-3.5" aria-hidden />
              {compact ? null : label}
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>

      {/* A sibling, not a child: a radiogroup owns its radios and nothing else,
          and `sr-only` is absolutely positioned so it costs the parent's flex
          row no space. Scoped to this control rather than routed through the
          app-wide <LiveRegion />, which is not mounted on every route that
          carries a theme switch. Two slots, alternating, because writing the
          same sentence back into the same node is not a mutation and a screen
          reader would stay silent the second time. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span>{spoken.id % 2 === 0 ? spoken.text : ""}</span>
        <span>{spoken.id % 2 === 1 ? spoken.text : ""}</span>
      </div>
    </>
  );
}
