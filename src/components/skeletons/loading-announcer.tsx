"use client";

import { useEffect, useState } from "react";

/**
 * The only part of a loading screen assistive technology is meant to hear.
 *
 * The label is inserted *after* the region is already in the document, not
 * rendered with it. A live region reports changes made to its contents, and a
 * region that arrives with its text already inside is not reliably such a
 * change — so the region mounts empty and the text lands a moment later.
 *
 * That moment is the same delay the placeholders wait out, which keeps the two
 * channels saying the same thing: a load that resolves before the delay is
 * neither drawn nor announced.
 */
export function LoadingAnnouncer({ label, delayMs }: { label: string; delayMs: number }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSpeaking(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {speaking ? label : ""}
    </p>
  );
}
