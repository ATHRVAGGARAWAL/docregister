"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isInsideModal,
  useEscapeLayer,
  useShortcutRegistry,
} from "@/hooks/use-keyboard-shortcuts";

/**
 * Multi-select over an ordered list of rows.
 *
 * The caller hands over the ids that are *eligible* for selection, in the order
 * they are drawn. Everything else follows from that one list:
 *
 * - A row that is not eligible cannot be selected, cannot be reached by a
 *   shift-range, and cannot appear in `selectedIds`. Ineligibility is not a
 *   check performed at action time that could be forgotten — it is the absence
 *   of an id from the list this hook was given.
 * - A selection never outlives the rows it points at. `selectedIds` is derived
 *   by filtering the eligible list, so paging the register or narrowing a
 *   filter empties the selection rather than leaving it holding ids that are no
 *   longer on screen. There is no effect to race and no window in which the
 *   count on screen disagrees with what an action would touch.
 *
 * `eligibleIds` should be memoised by the caller; a fresh array every render
 * recomputes the derived sets, which is cheap but pointless.
 */

const NOTHING: ReadonlySet<string> = new Set<string>();

/**
 * Spread onto a `<button type="button">` that stands for one row. A button
 * rather than a checkbox input because the range and toggle semantics below are
 * ours, not the browser's, and because the register's rows are cards.
 */
export interface SelectionItemProps {
  role: "checkbox";
  "aria-checked": boolean;
  "data-selection-item": string;
  onClick: (event: ReactMouseEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
}

export interface SelectionControls {
  /** Selected ids in list order. Never holds an id the current list lacks. */
  selectedIds: readonly string[];
  count: number;
  /** How many rows could be selected at all. */
  eligibleCount: number;
  isSelected: (id: string) => boolean;
  /** There is something to select and all of it is selected. */
  allSelected: boolean;
  /** Some but not all — the "mixed" state of a master checkbox. */
  partiallySelected: boolean;
  /** `extend` grows the selection from the anchor to `id`. */
  toggle: (id: string, options?: { extend?: boolean }) => void;
  selectAll: () => void;
  clear: () => void;
  /** Focus a row control. False when that row is no longer rendered. */
  focusItem: (id: string) => boolean;
  /** Focus the row the last toggle touched — where focus belongs after a bar closes. */
  focusLastItem: () => boolean;
  itemProps: (id: string) => SelectionItemProps;
}

export function useSelection(eligibleIds: readonly string[]): SelectionControls {
  const [picked, setPicked] = useState<ReadonlySet<string>>(NOTHING);

  // Neither the anchor nor the last-touched row is drawn, so holding them in
  // state would re-render every row on every click to move a value only the
  // next event handler reads.
  const anchorRef = useRef<string | null>(null);
  const lastTouchedRef = useRef<string | null>(null);

  const eligible = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const selectedIds = useMemo(
    () => eligibleIds.filter((id) => picked.has(id)),
    [eligibleIds, picked],
  );

  const toggle = useCallback(
    (id: string, options?: { extend?: boolean }) => {
      if (!eligible.has(id)) return;

      const extend = options?.extend === true;
      const anchor = anchorRef.current;
      const anchorIndex = anchor === null ? -1 : eligibleIds.indexOf(anchor);
      const ranged = extend && anchorIndex !== -1;

      lastTouchedRef.current = id;

      setPicked((current) => {
        const next = new Set<string>();
        for (const existing of current) {
          if (eligible.has(existing)) next.add(existing);
        }

        if (ranged) {
          const index = eligibleIds.indexOf(id);
          const from = Math.min(anchorIndex, index);
          const to = Math.max(anchorIndex, index);
          // A range only ever adds. Applying the anchor's state to the span —
          // the other common reading of shift-click — means a stray shift can
          // silently drop rows a doctor had already picked out for discard, and
          // the loss is invisible because the rows simply stop being ticked.
          for (let step = from; step <= to; step += 1) next.add(eligibleIds[step]);
          return next;
        }

        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });

      // The anchor stays put through a range so successive shift-clicks all
      // measure from the same origin, which is what lets a doctor widen and
      // narrow a span without starting over.
      if (!ranged) anchorRef.current = id;
    },
    [eligible, eligibleIds],
  );

  const selectAll = useCallback(() => {
    setPicked(new Set(eligibleIds));
  }, [eligibleIds]);

  const clear = useCallback(() => {
    setPicked(NOTHING);
    anchorRef.current = null;
  }, []);

  const isSelected = useCallback(
    (id: string) => picked.has(id) && eligible.has(id),
    [eligible, picked],
  );

  // Found by attribute rather than through a ref map: the ids come and go with
  // every page of the register, and a map keyed by them is a cache with no
  // eviction point. The attribute also gives tests a handle on a row control.
  const focusItem = useCallback((id: string) => {
    if (typeof document === "undefined") return false;
    const node = document.querySelector<HTMLElement>(
      `[data-selection-item="${escapeAttributeValue(id)}"]`,
    );
    if (!node) return false;
    node.focus();
    return true;
  }, []);

  const focusLastItem = useCallback(() => {
    const id = lastTouchedRef.current;
    return id === null ? false : focusItem(id);
  }, [focusItem]);

  const itemProps = useCallback(
    (id: string): SelectionItemProps => ({
      role: "checkbox",
      "aria-checked": isSelected(id),
      "data-selection-item": id,
      onClick: (event) => toggle(id, { extend: event.shiftKey }),
      onKeyDown: (event) => {
        if (event.key !== " " && event.key !== "Spacebar") return;
        // Space on a button scrolls the page and then synthesises a click.
        // Claiming it here stops the scroll and keeps Shift+Space a single
        // range extension rather than a toggle followed by a click.
        event.preventDefault();
        toggle(id, { extend: event.shiftKey });
      },
    }),
    [isSelected, toggle],
  );

  const count = selectedIds.length;
  const eligibleCount = eligibleIds.length;

  return {
    selectedIds,
    count,
    eligibleCount,
    isSelected,
    allSelected: eligibleCount > 0 && count === eligibleCount,
    partiallySelected: count > 0 && count < eligibleCount,
    toggle,
    selectAll,
    clear,
    focusItem,
    focusLastItem,
    itemProps,
  };
}

/**
 * Escape for a layer that is not a dialog.
 *
 * Prefers the app's shortcut registry, which stacks layers so Escape only ever
 * reaches the topmost one. When no registry is mounted — a test, or a screen
 * that has not been wrapped yet — it falls back to a window listener that
 * declines the key inside a modal, because a Radix dialog owns its own Escape
 * and closing a selection out from under an open patient chart is never what
 * the press meant.
 */
export function useEscapeDismiss(active: boolean, onDismiss: () => void): void {
  const registry = useShortcutRegistry();
  useEscapeLayer(active, onDismiss);

  const handlerRef = useRef(onDismiss);
  useEffect(() => {
    handlerRef.current = onDismiss;
  });

  useEffect(() => {
    if (registry || !active) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (isInsideModal(event.target)) return;
      event.preventDefault();
      handlerRef.current();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registry, active]);
}

/** `"` and `\` are the only characters that can break out of a quoted attribute selector. */
function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
