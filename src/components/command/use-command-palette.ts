"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface CommandPaletteController {
  open: boolean;
  /** Pass straight to `<CommandPalette onOpenChange={…} />`. */
  setOpen: (open: boolean) => void;
  openPalette: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Owns the palette's open state and the shortcut that reaches it.
 *
 * Separate from the palette itself so the shortcut works from a screen the
 * palette is not rendered on yet, and so a host can open it from a button
 * without knowing anything about the dialog.
 */
export function useCommandPalette({ enabled = true }: { enabled?: boolean } = {}): CommandPaletteController {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      // Held keys repeat many times a second, and each repeat would toggle the
      // palette again. The `defaultPrevented` half is near-vestigial and kept
      // only as a courtesy: this listener runs in the capture phase at `window`
      // (below), so nothing nearer the keystroke has run yet — the only thing
      // that can have claimed the key is another window-capture listener
      // registered ahead of it.
      if (event.defaultPrevented || event.repeat) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      // `code` as well as `key`: on a non-Latin layout the K key reports its own
      // letter, and a doctor switching layouts should not lose the shortcut.
      if (event.key !== "k" && event.key !== "K" && event.code !== "KeyK") return;

      // Firefox gives Ctrl-K to the address bar and Chrome hands Cmd-K to a
      // site search on some setups; without this the palette opens behind a
      // focused browser chrome field.
      event.preventDefault();
      setOpen((current) => !current);
    }

    // Capture: an open dialog or a text field must not be able to swallow the
    // one shortcut that is supposed to work anywhere.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled]);

  const openPalette = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  return useMemo(
    () => ({ open, setOpen, openPalette, close, toggle }),
    [open, openPalette, close, toggle],
  );
}
