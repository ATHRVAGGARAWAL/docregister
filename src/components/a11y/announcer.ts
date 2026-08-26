"use client";

/**
 * The store behind `<LiveRegion />`.
 *
 * Deliberately a module-level store rather than a React context: an announcement
 * is often raised from a place that has no component around it — a save queue, a
 * fetch helper, a `catch` block — and threading a provider through those is how
 * announcements end up not being made at all.
 */

export type Politeness = "polite" | "assertive";

export interface Announcement {
  /** Increments on every announcement, including repeats of the same sentence. */
  readonly id: number;
  readonly text: string;
  readonly politeness: Politeness;
}

const EMPTY: Announcement = { id: 0, text: "", politeness: "polite" };

let current: Announcement = EMPTY;
const listeners = new Set<() => void>();

/**
 * Speak `text` through the mounted live region.
 *
 * Polite by default, which is almost always right: it waits for the screen
 * reader to finish whatever it is saying instead of cutting the doctor off
 * mid-sentence. Reserve `"assertive"` for something that invalidates what they
 * are doing right now — a recording that stopped, a save that failed.
 */
export function announce(text: string, politeness: Politeness = "polite"): void {
  // Module state on the server is shared by every request, so an announcement
  // raised during render would leak between doctors. There is no screen reader
  // attached to a render pass anyway.
  if (typeof window === "undefined") return;

  const trimmed = text.trim();
  if (!trimmed) return;

  current = { id: current.id + 1, text: trimmed, politeness };
  for (const listener of listeners) listener();
}

export function subscribeToAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAnnouncement(): Announcement {
  return current;
}

export function getServerAnnouncement(): Announcement {
  return EMPTY;
}
