"use client";

import { createContext, use, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The shortcut registry: what a key press means, and who gets to say so.
 *
 * A component declares the keys it wants, and that same declaration is what the
 * "?" help sheet lists — so a shortcut that exists is a shortcut that is
 * documented, and one that unmounts stops being advertised. Nothing here reads
 * a hard-coded table of keys.
 *
 * The matching rules below exist because a global key listener in a clinical
 * app has two ways to be dangerous. It can steal a letter from a half-typed
 * patient name, and it can steal a modifier combination the browser needed. So
 * a shortcut only fires when no text field has focus, no modifier the shortcut
 * did not ask for is held, and no modal dialog is open on top.
 */

/** One press: a key, plus the modifiers that must be held with it. */
export interface ShortcutChord {
  /** Lower-cased `KeyboardEvent.key`; a space is spelled `space`. */
  key: string;
  /** The platform's command modifier — Command on Apple, Ctrl elsewhere. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ShortcutDefinition {
  /** Stable and unique. Registering the same id again replaces the entry. */
  id: string;
  /**
   * A space separates presses, `+` separates modifiers within one press:
   * `"g r"` is g then r, `"mod+k"` is a single chord, `"?"` is one key.
   * The literal plus key is written `"plus"`.
   */
  keys: string;
  /** How the help sheet names the action, under its area heading. */
  label: string;
  /** The help sheet groups by this. Areas appear in first-registration order. */
  area: string;
  /** Optional second line in the help sheet. */
  hint?: string;
  /** A disabled shortcut is neither matched nor listed. Defaults to enabled. */
  enabled?: boolean;
  /**
   * Fires even while a text field has focus. Almost nothing should set this: a
   * letter key that reaches a half-typed patient name is the failure this whole
   * layer exists to prevent. Escape sets it, because a panel that cannot be
   * dismissed from the field you are typing in is a trap.
   */
  whileTyping?: boolean;
  /**
   * Returning `false` declines the key: the registry leaves the browser default
   * alone and the press behaves as though no shortcut had claimed it.
   */
  run: () => boolean | void;
}

export interface RegisteredShortcut {
  id: string;
  keys: string;
  label: string;
  area: string;
  hint?: string;
  enabled: boolean;
  whileTyping: boolean;
  chords: ShortcutChord[];
  /** Registration sequence. The help sheet lists in this order. */
  order: number;
  run: () => boolean | void;
}

/** The parts of a keyboard event matching needs, so the matcher stays testable. */
export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// ---------------------------------------------------------------------------
// Parsing and matching
// ---------------------------------------------------------------------------

/** A space is `" "` in `KeyboardEvent.key`, which no shortcut string can hold. */
export function normaliseEventKey(key: string): string {
  if (key === " " || key === "Spacebar") return "space";
  return key.toLowerCase();
}

function isSingleCharacter(key: string): boolean {
  return Array.from(key).length === 1;
}

function parseChord(step: string): ShortcutChord | null {
  const chord: ShortcutChord = { key: "", mod: false, shift: false, alt: false };

  for (const token of step.split("+")) {
    const name = token.trim().toLowerCase();
    if (!name) continue;
    if (name === "mod") chord.mod = true;
    else if (name === "shift") chord.shift = true;
    else if (name === "alt") chord.alt = true;
    else chord.key = name === "plus" ? "+" : name;
  }

  return chord.key ? chord : null;
}

export function parseShortcut(keys: string): ShortcutChord[] {
  return keys
    .trim()
    .split(/\s+/)
    .map(parseChord)
    .filter((chord): chord is ShortcutChord => chord !== null);
}

export function matchesChord(
  chord: ShortcutChord,
  event: KeyboardEventLike,
  applePlatform: boolean,
): boolean {
  const command = applePlatform ? event.metaKey : event.ctrlKey;
  const foreign = applePlatform ? event.ctrlKey : event.metaKey;

  // Ctrl+R and Command+R belong to the browser, and a page that swallows them
  // is a page a doctor cannot reload. Any modifier the chord did not ask for
  // disqualifies the match rather than being ignored.
  if (chord.mod !== command || foreign) return false;
  if (chord.alt !== event.altKey) return false;
  if (normaliseEventKey(event.key) !== chord.key) return false;

  // Shift is only asserted when the chord names it. For a printable key the
  // layout has already applied shift — `?` is Shift+/ on a US keyboard and
  // Shift+ß on a German one — so also demanding `shiftKey` would make the
  // shortcut unreachable wherever the character sits unshifted.
  if (chord.shift && !event.shiftKey) return false;
  if (!chord.shift && event.shiftKey && !isSingleCharacter(chord.key)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Where a key press must not be intercepted
// ---------------------------------------------------------------------------

/**
 * `HTMLInputElement.type` normalises a missing or unknown attribute to `text`,
 * so this list is what genuinely swallows letters. A checkbox, a radio, a file
 * picker or a range slider is not a typing target — taking `n` away there would
 * cost a shortcut for nothing.
 */
const TYPING_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

/** ARIA widgets that take text even when they are not built from an `<input>`. */
const TYPING_ROLES = new Set(["combobox", "searchbox", "spinbutton", "textbox"]);

/** Opt-out for a region that handles its own keys, such as a custom editor. */
const IGNORE_SELECTOR = "[data-shortcuts='ignore']";

interface ElementLike {
  tagName?: unknown;
  type?: unknown;
  isContentEditable?: unknown;
  getAttribute?: unknown;
  closest?: unknown;
}

function asElement(target: EventTarget | null): ElementLike | null {
  return target && typeof target === "object" ? (target as ElementLike) : null;
}

function attribute(element: ElementLike, name: string): string | null {
  if (typeof element.getAttribute !== "function") return null;
  const value = (element.getAttribute as (attributeName: string) => unknown)(name);
  return typeof value === "string" ? value : null;
}

function inside(element: ElementLike, selector: string): boolean {
  if (typeof element.closest !== "function") return false;
  return Boolean((element.closest as (query: string) => unknown)(selector));
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (!element) return false;

  // Inherited by descendants, which is what makes a caret inside a rich text
  // region count even when the event fires on a child span.
  if (element.isContentEditable === true) return true;

  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = typeof element.type === "string" ? element.type.toLowerCase() : "text";
    return TYPING_INPUT_TYPES.has(type);
  }

  const role = attribute(element, "role");
  if (role && TYPING_ROLES.has(role.toLowerCase())) return true;

  return inside(element, IGNORE_SELECTOR);
}

/**
 * A modal dialog is an exclusive context. Radix traps focus inside it, so while
 * one is open the event target is within it — and jumping workspaces out from
 * under an open patient chart, or starting a dictation behind it, is never what
 * the press meant. The dialog already owns Escape, too.
 */
export function isInsideModal(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (element && inside(element, OPEN_DIALOG_SELECTOR)) return true;

  // Falling back to a document-wide check, because climbing from the target is
  // not enough on its own: this listener is on `window`, and a press that lands
  // while focus sits on `<body>` — after a dialog has opened but before focus
  // has moved into it, or after a control inside it unmounts — reports a target
  // outside the dialog while the dialog is unmistakably open.
  //
  // The question the callers actually ask is "is a modal open", not "did this
  // keystroke originate inside one", and the answer has to be the same either
  // way. `n` starting a dictation behind an unconfirmed review sheet is the case
  // that matters: the sheet holds a visit the doctor has not filed yet.
  if (typeof document === "undefined") return false;
  return document.querySelector(OPEN_DIALOG_SELECTOR) !== null;
}

/**
 * What an open Radix dialog actually looks like in the DOM.
 *
 * Not `[aria-modal="true"]`, which is what this used to test for and which
 * `@radix-ui/react-dialog` never emits — it aria-hides everything outside the
 * content instead, and its own source calls that "a better supported equivalent
 * to setting aria-modal". Verified: zero occurrences of the attribute in
 * `node_modules/@radix-ui/react-dialog/dist/index.mjs`. So the guard matched
 * nothing, in either direction, for every dialog in this app.
 */
const OPEN_DIALOG_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** A sequence half-entered: which shortcuts are still reachable, and how deep. */
export interface PendingSequence {
  ids: string[];
  depth: number;
}

export type ShortcutResolution =
  | { kind: "none" }
  | { kind: "cancel" }
  | { kind: "pending"; ids: string[]; depth: number }
  | { kind: "run"; shortcut: RegisteredShortcut };

/**
 * Decides what one press means, given what has already been pressed.
 *
 * Callers filter the shortcut list first — by `enabled`, and by `whileTyping`
 * when a text field has focus — so this never has to know where the keyboard
 * is pointed.
 */
export function resolveKeyPress(
  shortcuts: readonly RegisteredShortcut[],
  event: KeyboardEventLike,
  applePlatform: boolean,
  pending: PendingSequence | null,
): ShortcutResolution {
  const depth = (pending?.depth ?? 0) + 1;
  const candidates = shortcuts.filter((shortcut) => {
    if (pending && !pending.ids.includes(shortcut.id)) return false;
    const chord = shortcut.chords[depth - 1];
    return chord !== undefined && matchesChord(chord, event, applePlatform);
  });

  // A shortcut that ends here wins over one that wants more keys, so a
  // complete sequence never sits waiting on a timer.
  const complete = candidates.find((shortcut) => shortcut.chords.length === depth);
  if (complete) return { kind: "run", shortcut: complete };

  const longer = candidates.filter((shortcut) => shortcut.chords.length > depth);
  if (longer.length > 0) {
    return { kind: "pending", ids: longer.map((shortcut) => shortcut.id), depth };
  }

  // A prefix was armed and this key completes nothing: swallow it, so `g`
  // followed by a typo cannot fall through to whatever that key does alone.
  return pending ? { kind: "cancel" } : { kind: "none" };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export interface ShortcutKeyLabel {
  /** What is drawn on the key cap. */
  symbol: string;
  /** What a screen reader should say — a glyph like the Command sign does not
   *  read as the name of a key. */
  spoken: string;
}

const NAMED_KEYS: Record<string, ShortcutKeyLabel> = {
  arrowdown: { symbol: "↓", spoken: "Down arrow" },
  arrowleft: { symbol: "←", spoken: "Left arrow" },
  arrowright: { symbol: "→", spoken: "Right arrow" },
  arrowup: { symbol: "↑", spoken: "Up arrow" },
  backspace: { symbol: "⌫", spoken: "Backspace" },
  delete: { symbol: "Del", spoken: "Delete" },
  enter: { symbol: "Enter", spoken: "Enter" },
  escape: { symbol: "Esc", spoken: "Escape" },
  space: { symbol: "Space", spoken: "Space" },
  tab: { symbol: "Tab", spoken: "Tab" },
};

export function formatShortcutKey(key: string): ShortcutKeyLabel {
  const named = NAMED_KEYS[key];
  if (named) return named;
  const symbol = isSingleCharacter(key) ? key.toUpperCase() : key;
  return { symbol, spoken: symbol };
}

/** The key caps for one press, modifiers first, in the order a keyboard reads. */
export function formatChord(chord: ShortcutChord, applePlatform: boolean): ShortcutKeyLabel[] {
  const caps: ShortcutKeyLabel[] = [];
  if (chord.mod) {
    caps.push(
      applePlatform
        ? { symbol: "⌘", spoken: "Command" }
        : { symbol: "Ctrl", spoken: "Control" },
    );
  }
  if (chord.alt) {
    caps.push(
      applePlatform ? { symbol: "⌥", spoken: "Option" } : { symbol: "Alt", spoken: "Alt" },
    );
  }
  if (chord.shift) {
    caps.push(
      applePlatform ? { symbol: "⇧", spoken: "Shift" } : { symbol: "Shift", spoken: "Shift" },
    );
  }
  caps.push(formatShortcutKey(chord.key));
  return caps;
}

export function sortRegisteredShortcuts(
  shortcuts: Iterable<RegisteredShortcut>,
): RegisteredShortcut[] {
  const list = [...shortcuts];

  // An area sits where its first shortcut registered, which tracks the order
  // the app mounts things in rather than an alphabet nobody asked for.
  const areaOrder = new Map<string, number>();
  for (const shortcut of list) {
    const first = areaOrder.get(shortcut.area);
    if (first === undefined || shortcut.order < first) areaOrder.set(shortcut.area, shortcut.order);
  }

  return list.sort(
    (a, b) => (areaOrder.get(a.area) ?? 0) - (areaOrder.get(b.area) ?? 0) || a.order - b.order,
  );
}

export interface ShortcutGroup {
  area: string;
  shortcuts: RegisteredShortcut[];
}

/**
 * Disabled shortcuts are dropped here: a help sheet that lists a key which does
 * nothing is worse than one that lists nothing at all.
 */
export function groupShortcutsByArea(shortcuts: readonly RegisteredShortcut[]): ShortcutGroup[] {
  const groups: ShortcutGroup[] = [];

  for (const shortcut of sortRegisteredShortcuts(shortcuts)) {
    if (!shortcut.enabled) continue;
    const group = groups.find((entry) => entry.area === shortcut.area);
    if (group) group.shortcuts.push(shortcut);
    else groups.push({ area: shortcut.area, shortcuts: [shortcut] });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export function isApplePlatform(agent: { platform?: string; userAgent?: string }): boolean {
  return /\b(?:mac|iphone|ipad|ipod)/i.test(`${agent.platform ?? ""} ${agent.userAgent ?? ""}`);
}

const NEVER_CHANGES = () => () => {};

function readApplePlatform(): boolean {
  const hints = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return isApplePlatform({
    platform: hints?.platform ?? navigator.platform,
    userAgent: navigator.userAgent,
  });
}

/**
 * The server has no keyboard, so it renders the Ctrl spelling and the client
 * corrects it as it hydrates. `useSyncExternalStore` is what makes that a
 * supported swap instead of a hydration mismatch.
 */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, readApplePlatform, () => false);
}

// ---------------------------------------------------------------------------
// Context and hooks
// ---------------------------------------------------------------------------

export interface ShortcutRegistry {
  register: (definition: ShortcutDefinition) => () => void;
  /**
   * Claims Escape until the returned cleanup runs. Layers are a stack: only the
   * one pushed last is asked to close.
   */
  pushEscapeLayer: (handler: () => void) => () => void;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
}

export const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);

/**
 * Null when no provider is mounted. The hooks below no-op in that case on
 * purpose: a workspace that declares a shortcut has to keep working when it is
 * rendered outside the provider — in a test, or on a screen nobody has wired up
 * yet — rather than take the register down over a convenience.
 */
export function useShortcutRegistry(): ShortcutRegistry | null {
  return use(ShortcutRegistryContext);
}

export function useShortcut(definition: ShortcutDefinition): void {
  const registry = use(ShortcutRegistryContext);
  const { id, keys, label, area, hint, enabled = true, whileTyping = false } = definition;

  // Read at fire time rather than captured at registration, so a handler may
  // close over fresh state without the registry churning every render.
  const runRef = useRef(definition.run);
  useEffect(() => {
    runRef.current = definition.run;
  });

  useEffect(() => {
    if (!registry) return undefined;
    return registry.register({
      id,
      keys,
      label,
      area,
      hint,
      enabled,
      whileTyping,
      run: () => runRef.current(),
    });
  }, [registry, id, keys, label, area, hint, enabled, whileTyping]);
}

function displaySignature(definition: ShortcutDefinition): string {
  return [
    definition.id,
    definition.keys,
    definition.label,
    definition.area,
    definition.hint ?? "",
    definition.enabled !== false,
    definition.whileTyping === true,
  ].join(" ");
}

/**
 * Several shortcuts from one component. Rules of hooks rule out calling
 * `useShortcut` in a loop, and this is cheaper anyway: one effect, one cleanup.
 */
export function useShortcuts(definitions: readonly ShortcutDefinition[]): void {
  const registry = use(ShortcutRegistryContext);

  const latest = useRef(definitions);
  useEffect(() => {
    latest.current = definitions;
  });

  const signature = definitions.map(displaySignature).join("");

  useEffect(() => {
    if (!registry) return undefined;
    const cancels = latest.current.map((definition, index) =>
      registry.register({
        ...definition,
        run: () => (latest.current[index] ?? definition).run(),
      }),
    );
    return () => {
      for (const cancel of cancels) cancel();
    };
    // Keyed on what the registry and the help sheet can actually see, not on
    // array identity — so a caller may build the array inline without this
    // effect tearing every registration down and rebuilding it each render.
  }, [registry, signature]);
}

/**
 * Claims Escape while `active`. Radix dialogs handle their own Escape, so this
 * is for the layers that are not dialogs — a disclosure panel, an inline
 * editor, a custom overlay.
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const registry = use(ShortcutRegistryContext);

  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });

  useEffect(() => {
    if (!registry || !active) return undefined;
    return registry.pushEscapeLayer(() => handlerRef.current());
  }, [registry, active]);
}
