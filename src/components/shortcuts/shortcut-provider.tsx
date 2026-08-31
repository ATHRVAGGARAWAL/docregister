"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ShortcutHelpSheet } from "@/components/shortcuts/shortcut-help-sheet";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import type { AppView } from "@/components/dashboard/app-navigation";
import {
  ShortcutRegistryContext,
  isInsideModal,
  isTypingTarget,
  normaliseEventKey,
  parseShortcut,
  resolveKeyPress,
  sortRegisteredShortcuts,
  useApplePlatform,
  type PendingSequence,
  type RegisteredShortcut,
  type ShortcutDefinition,
  type ShortcutRegistry,
} from "@/hooks/use-keyboard-shortcuts";

/**
 * How long a `g` stays armed waiting for its second key.
 *
 * Deliberately generous rather than tight. An unrecognised second key cancels
 * the sequence and is swallowed, so waiting too long costs nothing; expiring
 * too early costs a stray `r` landing on the page as a bare shortcut.
 */
const SEQUENCE_WINDOW_MS = 1500;

/**
 * A key per workspace, checked by the compiler: adding a view to `AppView`
 * without giving it a key stops the build rather than shipping a shortcut layer
 * with a hole in it.
 *
 * `r` is Register's, so Recall takes the `l` it ends on and Follow-ups takes
 * its own initial.
 */
const WORKSPACE_KEYS: Record<AppView, { key: string; label: string }> = {
  overview: { key: "o", label: "Overview" },
  register: { key: "r", label: "Register" },
  patients: { key: "p", label: "Patients" },
  recall: { key: "l", label: "Recall" },
  "follow-ups": { key: "f", label: "Follow-ups" },
  accounts: { key: "a", label: "Accounts" },
  // The practice workspaces get the letters their names actually start with,
  // except Treatments — "t" is taken by nothing yet but "d" reads as dental.
  schedule: { key: "c", label: "Schedule" },
  treatments: { key: "d", label: "Treatments" },
  operations: { key: "b", label: "Lab & stock" },
  finance: { key: "n", label: "Finance" },
  reports: { key: "e", label: "Reports" },
  settings: { key: "s", label: "Settings" },
};

/** What `/` reaches for, in preference order. */
const SEARCH_SELECTOR = '[data-shortcut-search], input[type="search"]';

/**
 * Focus goes to the first search box the screen is actually showing.
 *
 * `getClientRects()` is empty for anything `display: none` — which is what the
 * closed mobile navigation sheet and every unmounted workspace leave behind.
 * Focusing one of those would scroll the page to a box nobody can see.
 */
function focusSearchField(): boolean {
  for (const field of document.querySelectorAll<HTMLInputElement>(SEARCH_SELECTOR)) {
    if (field.disabled || field.readOnly) continue;
    if (field.getClientRects().length === 0) continue;

    field.focus();
    if (typeof field.select === "function") field.select();
    return true;
  }

  return false;
}

/** A pending sequence, plus the keys already pressed so the chip can draw them. */
interface ArmedSequence extends PendingSequence {
  keys: string;
}

export interface ShortcutProviderProps {
  children: ReactNode;
  /**
   * Handles `g` then a workspace key. Omitted, those shortcuts are neither
   * registered nor listed — the help sheet never advertises a dead key.
   *
   * A screen reader is told the destination, because switching workspaces
   * replaces the page without moving focus. If you also want focus to land in
   * the new workspace, do it here: this layer will not reach into a tree it
   * does not own to move a caret.
   */
  onNavigate?: (view: AppView) => void;
  /** Handles `n`. Omitted, `n` is not registered. */
  onNewDictation?: () => void;
  /**
   * Handles `/`. Omitted, focus goes to the first visible `input[type=search]`
   * or `[data-shortcut-search]` on the page, which is enough for every search
   * field in this app.
   */
  onFocusSearch?: () => void;
}

/**
 * The global shortcut layer: one key listener, one registry, one help sheet.
 *
 * Mount it once, around everything. Components below it declare shortcuts with
 * `useShortcut`, and what they declare is what "?" lists.
 *
 * The listener stands down more often than it fires, which is the point. It
 * ignores a press when a text field or a contenteditable region has focus, when
 * a modal dialog is open, when the key is a repeat from a held-down finger,
 * while an IME is composing, when another handler has already claimed the
 * event, and whenever a modifier the shortcut did not ask for is down — so
 * Ctrl+R still reloads and Command+F still finds.
 */
export function ShortcutProvider({
  children,
  onNavigate,
  onNewDictation,
  onFocusSearch,
}: ShortcutProviderProps) {
  const applePlatform = useApplePlatform();

  const [helpOpen, setHelpOpen] = useState(false);
  const [listed, setListed] = useState<RegisteredShortcut[]>([]);
  const [pendingKeys, setPendingKeys] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const entriesRef = useRef(new Map<string, RegisteredShortcut>());
  const escapeLayersRef = useRef<Array<{ run: () => void }>>([]);
  const pendingRef = useRef<ArmedSequence | null>(null);
  const timerRef = useRef<number | null>(null);

  // A shortcut keeps the position it was first given, so a workspace that
  // remounts does not shuffle itself to the bottom of its section.
  const orderByIdRef = useRef(new Map<string, number>());
  const nextOrderRef = useRef(0);

  const publish = useCallback(() => {
    setListed(sortRegisteredShortcuts(entriesRef.current.values()));
  }, []);

  const register = useCallback(
    (definition: ShortcutDefinition) => {
      let order = orderByIdRef.current.get(definition.id);
      if (order === undefined) {
        nextOrderRef.current += 1;
        order = nextOrderRef.current;
        orderByIdRef.current.set(definition.id, order);
      }

      const entry: RegisteredShortcut = {
        id: definition.id,
        keys: definition.keys,
        label: definition.label,
        area: definition.area,
        hint: definition.hint,
        enabled: definition.enabled !== false,
        whileTyping: definition.whileTyping === true,
        chords: parseShortcut(definition.keys),
        order,
        run: definition.run,
      };

      entriesRef.current.set(entry.id, entry);
      publish();

      return () => {
        // Only if this exact entry is still the one on file. A component that
        // re-registers before its previous cleanup runs must not have its
        // successor deleted out from under it.
        if (entriesRef.current.get(entry.id) !== entry) return;
        entriesRef.current.delete(entry.id);
        publish();
      };
    },
    [publish],
  );

  const pushEscapeLayer = useCallback((handler: () => void) => {
    const layer = { run: handler };
    escapeLayersRef.current = [...escapeLayersRef.current, layer];
    return () => {
      escapeLayersRef.current = escapeLayersRef.current.filter((entry) => entry !== layer);
    };
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);

  const registry = useMemo<ShortcutRegistry>(
    () => ({ register, pushEscapeLayer, openHelp, closeHelp, toggleHelp }),
    [register, pushEscapeLayer, openHelp, closeHelp, toggleHelp],
  );

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingKeys("");
  }, []);

  // The provider sits above its own context, so its shortcuts go in directly
  // rather than through `useShortcut`.
  useEffect(() => {
    const cancels: Array<() => void> = [];

    if (onNavigate) {
      for (const view of Object.keys(WORKSPACE_KEYS) as AppView[]) {
        const { key, label } = WORKSPACE_KEYS[view];
        cancels.push(
          register({
            id: `navigate:${view}`,
            keys: `g ${key}`,
            label,
            area: "Go to",
            run: () => {
              onNavigate(view);
              setAnnouncement(`${label} workspace`);
            },
          }),
        );
      }
    }

    if (onNewDictation) {
      cancels.push(
        register({
          id: "dictation:new",
          keys: "n",
          label: "New dictation",
          area: "Actions",
          run: () => {
            onNewDictation();
          },
        }),
      );
    }

    cancels.push(
      register({
        id: "search:focus",
        keys: "/",
        label: "Search",
        area: "Actions",
        run: () => {
          if (onFocusSearch) {
            onFocusSearch();
            return;
          }
          if (!focusSearchField()) setAnnouncement("This screen has no search box.");
        },
      }),
    );

    cancels.push(
      register({
        id: "help:open",
        keys: "?",
        label: "Keyboard shortcuts",
        area: "General",
        run: () => setHelpOpen(true),
      }),
    );

    cancels.push(
      register({
        id: "layer:dismiss",
        keys: "Escape",
        label: "Close the panel on top",
        area: "General",
        whileTyping: true,
        run: () => {
          const layers = escapeLayersRef.current;
          const top = layers[layers.length - 1];
          // Nothing of ours is open, so Escape is not ours to take: a dialog,
          // a native picker or the page itself may still want it.
          if (!top) return false;
          top.run();
          return true;
        },
      }),
    );

    return () => {
      for (const cancel of cancels) cancel();
    };
  }, [register, onNavigate, onNewDictation, onFocusSearch]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Something nearer the press already claimed it.
      if (event.defaultPrevented) return;
      // A held key is one intent, not thirty: without this, a finger resting on
      // `n` opens a recording per repeat.
      if (event.repeat) return;
      // Mid-composition every keystroke belongs to the IME, and `keyCode === 229`
      // is the same signal from browsers that do not set `isComposing`.
      if (event.isComposing || event.keyCode === 229) return;
      if (isInsideModal(event.target)) return;

      if (pendingRef.current && normaliseEventKey(event.key) === "escape") {
        clearPending();
        event.preventDefault();
        return;
      }

      const typing = isTypingTarget(event.target);
      const candidates = [...entriesRef.current.values()].filter(
        (shortcut) => shortcut.enabled && (!typing || shortcut.whileTyping),
      );

      const outcome = resolveKeyPress(candidates, event, applePlatform, pendingRef.current);
      if (outcome.kind === "none") return;

      if (outcome.kind === "cancel") {
        clearPending();
        return;
      }

      if (outcome.kind === "pending") {
        const pressed = normaliseEventKey(event.key);
        const armed = pendingRef.current ? `${pendingRef.current.keys} ${pressed}` : pressed;
        pendingRef.current = { ids: outcome.ids, depth: outcome.depth, keys: armed };
        setPendingKeys(armed);
        setAnnouncement("Waiting for the next key. Escape cancels.");

        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(clearPending, SEQUENCE_WINDOW_MS);

        event.preventDefault();
        return;
      }

      clearPending();
      if (outcome.shortcut.run() !== false) event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applePlatform, clearPending]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <ShortcutRegistryContext.Provider value={registry}>
      {children}

      {/* Polite and out of the way: a workspace switch replaces the page under
          a screen reader with no focus change to notice it by. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {pendingKeys && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4 lg:left-64"
        >
          <span className="surface-elevated text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium">
            <ShortcutKeys keys={pendingKeys} applePlatform={applePlatform} />
            then…
          </span>
        </div>
      )}

      <ShortcutHelpSheet
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={listed}
        applePlatform={applePlatform}
      />
    </ShortcutRegistryContext.Provider>
  );
}
