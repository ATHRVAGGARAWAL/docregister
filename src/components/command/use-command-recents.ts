"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the doctor reached for last, so the resting palette is not the same
 * alphabetical list every morning.
 *
 * `sessionStorage`, not `localStorage`: these machines are shared — a front
 * desk terminal, a phone that gets handed around — and a list of the last
 * things somebody did should not outlive the tab they did them in.
 */
const STORAGE_KEY = "docregister:command-recents";

/** Four rows. Past that the shortcut list stops being a shortcut. */
const RECENTS_LIMIT = 4;

/**
 * Only workspaces and actions are remembered.
 *
 * A patient or visit id written to storage is a record of who was seen, kept
 * outside the register and outside every retention rule that governs it. The
 * palette can afford to forget those; the clinic cannot afford to store them
 * twice.
 */
const REMEMBERABLE_ID = /^(?:navigate|action):[a-z-]+$/;

export interface CommandRecents {
  /** Most recent first. Ids, resolved against the live item list by the caller. */
  ids: readonly string[];
  remember: (id: string) => void;
}

export function useCommandRecents(): CommandRecents {
  const [ids, setIds] = useState<readonly string[]>([]);
  const current = useRef<string[]>([]);

  // Read after mount rather than in a lazy initialiser: this hook is mounted by
  // a component that also renders on the server, where there is no storage and
  // where a different first render would be a hydration mismatch.
  useEffect(() => {
    current.current = read();
    setIds(current.current);
  }, []);

  const remember = useCallback((id: string) => {
    if (!REMEMBERABLE_ID.test(id)) return;

    current.current = [id, ...current.current.filter((existing) => existing !== id)].slice(
      0,
      RECENTS_LIMIT,
    );
    setIds(current.current);
    write(current.current);
  }, []);

  return { ids, remember };
}

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Re-checked on the way in as well as on the way out: what is in storage was
    // written by some earlier version of this file, not by this one.
    return parsed
      .filter((entry): entry is string => typeof entry === "string" && REMEMBERABLE_ID.test(entry))
      .slice(0, RECENTS_LIMIT);
  } catch {
    // Storage can be disabled outright, and Safari throws on read in private
    // mode. Losing the recents costs the doctor an extra keystroke; throwing
    // here would cost them the palette.
    return [];
  }
}

function write(ids: readonly string[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Full or blocked. Nothing here is worth interrupting anyone over.
  }
}
