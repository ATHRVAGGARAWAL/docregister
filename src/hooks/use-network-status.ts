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
 *
 *
 * ## No liveness probe, and why
 *
 * The obvious repair for the untrustworthy `true` is to poll something cheap
 * and same-origin. `/api/health` is right there and would serve: public,
 * `no-store`, and by its own docstring it touches neither Supabase nor a model
 * provider. It was considered and deliberately left out.
 *
 * A 200 from that route answers a different question than the one being asked.
 * What matters is whether *this upload* will land — an authenticated multipart
 * POST of consultation audio, to a different route. A health check passing a
 * moment earlier does not establish that. Nor is one needed to discover the
 * failure: the upload is itself a liveness probe, against the real endpoint,
 * with the real payload, and the dock already reads its result. Pairing that
 * outcome with `offline` is exactly what the caller does. The failure is the
 * measurement; a synthetic poll would be a lower-quality duplicate of it.
 *
 * The cost also falls in the wrong place. A poll runs for the life of the page,
 * on the clinic mobile data this app is trying to be careful with, to sharpen a
 * hint that is only ever read after something has already gone wrong.
 *
 * What makes the omission safe is that nothing fed by this hook takes an action.
 * `offline` picks wording, and gates an offer the doctor still has to press; it
 * never blocks the microphone and never sends anything by itself. So a `true`
 * that should have been `false` costs one tap and the ordinary error that would
 * have appeared anyway — a missed explanation, not a wrong move. A probe would
 * be worth its cost only if something automatic hung off the answer, and
 * deliberately nothing does. Add one only alongside that kind of change.
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
  // it firing on every render. The dock that consumes it re-renders far faster
  // than the network changes: its level meter is driven from a
  // requestAnimationFrame tick in VoiceRecorder, and the elapsed timer from a
  // 100ms interval. A fresh identity per render would retrigger a consumer's
  // effects at that rate for a value that did not change.
  return useMemo(() => ({ online, offline: !online }), [online]);
}
