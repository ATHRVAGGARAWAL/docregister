"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * What the doctor sees while a deferred chunk is in flight.
 *
 * Three rules hold this file together.
 *
 * A placeholder occupies the space its component will occupy. A card that grows
 * when it arrives shoves the row beneath it out from under a thumb that is
 * already moving, and on a phone that is a mis-tap on a patient record.
 *
 * A placeholder waits before it appears. On a clinic's wifi most of these
 * chunks resolve inside a frame or two, and a spinner that flashes for 60ms
 * reads as a fault rather than as progress. Nothing here is shown until the
 * wait is long enough to be worth explaining.
 *
 * A placeholder says what it is out loud. A pulsing rectangle is a sighted-only
 * cue; a screen reader that hears nothing between the tap and the panel has
 * been told the tap did nothing.
 */

/**
 * Long enough that a chunk served from cache never shows anything, short enough
 * that a real wait is acknowledged before the doctor taps again. Nielsen's
 * 0.1s/1s/10s thresholds put the boundary of "felt as instantaneous" at 100ms;
 * this sits just past it.
 */
const PENDING_GRACE_MS = 160;

/**
 * `false` until the load has gone on long enough to be worth a placeholder.
 *
 * Also the reason the announcement is not simply rendered on mount: a live
 * region has to be in the document before its contents change for assistive
 * technology to report the change at all, so the element mounts empty and the
 * text arrives afterwards.
 */
function usePendingLongEnough(): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setElapsed(true), PENDING_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return elapsed;
}

function PulseBlock({ className }: { className?: string }) {
  // `animate-pulse` is neutralised wholesale by the reduced-motion block in
  // globals.css, so the still version of this is the same shape in the same
  // place — not a frozen frame of an animation.
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-border", className)} />;
}

/**
 * Stands in for a chart card, mirroring `ChartFrame`'s box model element for
 * element so the swap costs no layout shift.
 *
 * `legend` and `footer` are not decoration: `ChartFrame` draws a legend only
 * for two or more series, and each chart trails its own summary line or does
 * not. Getting either wrong is a card that changes height when the real one
 * lands.
 */
export function ChartPending({
  title,
  legend = false,
  footer = false,
}: {
  title: string;
  legend?: boolean;
  footer?: boolean;
}) {
  const announce = usePendingLongEnough();

  return (
    <section
      role="status"
      aria-busy="true"
      className="surface-card relative isolate overflow-hidden rounded-[1.9rem] p-5 sm:p-6"
    >
      <span className="sr-only">{announce ? `Loading the ${title} chart` : ""}</span>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PulseBlock className="h-[18px] w-40 max-w-full" />
          <PulseBlock className="mt-1 h-5 w-56 max-w-full opacity-60" />
        </div>
        <div aria-hidden className="size-9 shrink-0 rounded-full border border-border bg-secondary" />
      </header>

      {legend && <PulseBlock className="mt-4 h-[18px] w-44 max-w-full opacity-60" />}

      <PulseBlock className="mt-5 h-48 w-full opacity-40 sm:h-60" />

      {footer && <PulseBlock className="mt-1 ml-auto h-5 w-32 opacity-60" />}
    </section>
  );
}

/**
 * Stands in for a sheet.
 *
 * Fixed rather than inline, because a sheet renders into a portal and leaves an
 * empty slot behind in the tree that mounts it — a block placeholder there
 * would open a hole in the page the sheet was never going to fill. Top-centred
 * clears the voice dock, which owns the bottom of the screen for the length of
 * a consultation.
 */
export function SheetPending({ label }: { label: string }) {
  const visible = usePendingLongEnough();

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "surface-elevated pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-full px-4 py-2.5 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span
        aria-hidden
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      <span className="truncate text-xs font-semibold text-foreground">
        {visible ? `Opening ${label}…` : ""}
      </span>
    </div>
  );
}

/**
 * Stands in for a whole view while its tab's chunk loads.
 *
 * Tall on purpose: these fill the main column, and a short placeholder that
 * grows to full height when the view arrives drags the page's scroll position
 * with it.
 */
export function WorkspacePending({ label }: { label: string }) {
  const visible = usePendingLongEnough();

  return (
    <div role="status" aria-busy="true" className="min-h-[60vh] w-full">
      <span className="sr-only">{visible ? `Loading ${label}` : ""}</span>

      {visible && (
        <div className="flex flex-col gap-4">
          <PulseBlock className="h-9 w-56 max-w-full" />
          <PulseBlock className="h-28 w-full opacity-50" />
          <PulseBlock className="h-28 w-full opacity-40" />
          <PulseBlock className="h-28 w-full opacity-30" />
        </div>
      )}
    </div>
  );
}
