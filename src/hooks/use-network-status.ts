"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * The browser's guess at the network, with its asymmetry left intact.
 *
 * `navigator.onLine` is a heuristic, and MDN is blunt about it: the two values
 * are not equally worth believing. `false` is the browser saying it has no
 * network link at all — the useful side, because a request made in that state
 * is going to fail. `true` says only that an interface exists: a phone
 * associated with a clinic's router that has lost its uplink, a captive portal
 * that has not been signed into, or a VPN adapter that is always "connected"
 * all report `true`. Nothing here is a promise that the server is reachable.
 *
 * MDN's own guidance follows from that, and it is the rule this app's dock
 * obeys: "you should not disable features based on the online status, only
 * provide hints when the user may seem offline." So callers may use `offline`
 * to explain and to prepare — never to take a control away, because the guess
 * can be wrong in both directions and a doctor mid-consultation cannot argue
 * with a greyed-out button.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
 */
export interface NetworkStatus {
  /** An interface exists. NOT a promise that anything is reachable. */
  online: boolean;
  /** The browser reports no network link. The side worth acting on. */
  offline: boolean;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * Rendered on a machine that by definition had a network, and read again on
 * the client the moment hydration finishes. Assuming online here keeps an
 * "you are offline" banner out of the server HTML, where it would be a guess
 * about someone else's phone.
 */
function getServerSnapshot(): boolean {
  return true;
}

export function useNetworkStatus(): NetworkStatus {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Held stable so a caller can put this object in a dependency array without
  // it firing on every render of a dock that re-renders ten times a second
  // throughout a recording.
  return useMemo(() => ({ online, offline: !online }), [online]);
}
