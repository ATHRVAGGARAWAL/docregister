"use client";

import * as React from "react";

import {
  getAnnouncement,
  getServerAnnouncement,
  subscribeToAnnouncements,
} from "@/components/a11y/announcer";

interface LiveRegionProps {
  /**
   * How long an announcement stays in the DOM before it is emptied. The text is
   * invisible but not unreachable — a screen reader's virtual cursor can land on
   * it — so a stale "Visit saved" left sitting in the page reads as a fact about
   * the present. Set to 0 to keep the last announcement indefinitely.
   */
  clearAfterMs?: number;
}

/**
 * The app's two live regions. Mount once, near the top of the tree, and
 * announce into it from anywhere with `announce()`.
 *
 * Both regions are rendered empty on first paint and stay mounted for the life
 * of the page. That ordering matters: a live region inserted into the DOM at the
 * same moment as its text is usually not announced at all, because assistive
 * technology has to be watching the node before the mutation happens.
 */
export function LiveRegion({ clearAfterMs = 8000 }: LiveRegionProps = {}) {
  const announcement = React.useSyncExternalStore(
    subscribeToAnnouncements,
    getAnnouncement,
    getServerAnnouncement,
  );
  const [clearedId, setClearedId] = React.useState(0);

  React.useEffect(() => {
    if (announcement.id === 0 || clearAfterMs <= 0) return;

    const timer = window.setTimeout(() => setClearedId(announcement.id), clearAfterMs);
    return () => window.clearTimeout(timer);
  }, [announcement, clearAfterMs]);

  const text = clearedId >= announcement.id ? "" : announcement.text;
  const polite = announcement.politeness === "polite" ? text : "";
  const assertive = announcement.politeness === "assertive" ? text : "";

  // Two slots per region, alternating. A screen reader announces a region when
  // its contents change, and writing the identical string back into the same
  // node is not a change — so "Saved" twice in a row would be read once. Moving
  // it between siblings makes the second one a real mutation.
  const slot = announcement.id % 2;

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span>{slot === 0 ? polite : ""}</span>
        <span>{slot === 1 ? polite : ""}</span>
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        <span>{slot === 0 ? assertive : ""}</span>
        <span>{slot === 1 ? assertive : ""}</span>
      </div>
    </>
  );
}
