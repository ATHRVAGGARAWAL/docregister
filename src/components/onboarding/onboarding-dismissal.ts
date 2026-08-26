"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the doctor has put the setup checklist away.
 *
 * This is the only thing about onboarding that is stored anywhere, and it is
 * stored in `localStorage` — never on the server, never alongside a visit. It
 * holds one character. It names no doctor, no patient and no clinic, and there
 * is nothing in it to correlate a device with a person.
 *
 * Un-keyed by doctor, deliberately. Keying it would mean writing a doctor id
 * into a browser that a whole front desk shares, which is a record of who used
 * this machine kept outside every retention rule in the app. The cost is that
 * one doctor dismissing the checklist on a shared phone dismisses it for the
 * next; `restoreOnboarding()` puts it back, and Settings offers that.
 *
 * Progress is never stored. Which steps are done is re-derived from the profile
 * and the register every time — see `onboarding-steps.ts`.
 */
const STORAGE_KEY = "docregister:onboarding-dismissed";

const DISMISSED = "1";

/**
 * `null` means "not established yet", which is the honest answer during server
 * render and hydration: there is no storage on a server, and guessing `false`
 * would flash a checklist the doctor already dismissed onto the screen.
 */
export type DismissalState = boolean | null;

let cached: DismissalState = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === DISMISSED;
  } catch {
    // Storage can be turned off outright, and Safari throws on read in private
    // mode. Showing the checklist to someone who dismissed it costs them one
    // tap; throwing here costs them the dashboard.
    return false;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (cached === null) cached = read();
  listeners.add(listener);

  // Settings and the dashboard can be open in two tabs, and `storage` is the
  // only signal the other tab gets. Without this, restoring the checklist in
  // one tab leaves the other insisting it is dismissed until a reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    const next = read();
    if (next === cached) return;
    cached = next;
    emit();
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): DismissalState {
  if (cached === null) cached = read();
  return cached;
}

function getServerSnapshot(): DismissalState {
  return null;
}

function write(dismissed: boolean): void {
  // The in-memory value leads, so the checklist responds to the tap even when
  // the write below is refused.
  if (cached !== dismissed) {
    cached = dismissed;
    emit();
  }

  try {
    if (dismissed) window.localStorage.setItem(STORAGE_KEY, DISMISSED);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Full, blocked, or private mode. The choice holds for this tab and is
    // forgotten on reload, which is not worth interrupting a consultation over.
  }
}

/** Put the checklist away. Survives reloads on this device until restored. */
export function dismissOnboarding(): void {
  write(true);
}

/** Bring it back — what the control in Settings calls. */
export function restoreOnboarding(): void {
  write(false);
}

export interface OnboardingDismissal {
  /** `null` until the browser has been asked. Render nothing while it is null. */
  dismissed: DismissalState;
  dismiss: () => void;
  restore: () => void;
}

export function useOnboardingDismissal(): OnboardingDismissal {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Both writers are module-level and already stable, so there is nothing here
  // for `useCallback` to hold on to.
  return { dismissed, dismiss: dismissOnboarding, restore: restoreOnboarding };
}
