import type { ReactNode } from "react";

import { LoadingAnnouncer } from "@/components/skeletons/loading-announcer";
import { cn } from "@/lib/utils";

/**
 * How long placeholders stay invisible before they fade in.
 *
 * A load that resolves inside this window never draws anything, because a shape
 * that appears and vanishes again reads as a fault rather than as progress. The
 * space is reserved from the first frame either way — only the ink waits — so
 * nothing moves when the real content arrives during the wait.
 */
export const SKELETON_REVEAL_MS = 200;

/**
 * Holds a set of placeholders invisible for {@link SKELETON_REVEAL_MS}, then
 * fades them in.
 *
 * The gate is a CSS animation rather than a mounted timer because placeholders
 * also render as a route fallback, streamed ahead of any JavaScript: a gate that
 * needed hydration would leave a doctor on a clinic connection looking at
 * nothing at all until the bundle arrived.
 *
 * Use this directly only for a second region on a screen that already has a
 * {@link SkeletonScreen} — a page announces itself once, not once per region.
 */
export function SkeletonReveal({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    /* `fill-mode-backwards` is what holds the shape at zero opacity through the
       delay instead of flashing it and then fading it in.
       Deliberately not `motion-safe:`: that variant emits nothing at all under a
       reduced-motion preference, which would take the delay away with the fade
       and put the flash back. The global rule in globals.css already collapses
       the duration to 0.001ms there, and an animation-delay it does not touch
       still holds — so a reduced-motion reader gets the same 200ms of nothing
       followed by a cut, with no fade. */
    <div
      aria-hidden
      className={cn("animate-in fade-in fill-mode-backwards", className)}
      // Inline so the delay and SKELETON_REVEAL_MS cannot drift apart: Tailwind
      // cannot read a constant. `style-src-attr` is `'unsafe-inline'` in
      // src/lib/security/headers.ts, so the attribute survives the CSP.
      style={{ animationDelay: `${SKELETON_REVEAL_MS}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * The wrapper a screen's placeholders are rendered through.
 *
 * It owns the one thing that must not be repeated per row or per region: a
 * single polite announcement, made on the same delay as the reveal so a screen
 * reader is not told about a load that never showed. Placeholder shapes
 * themselves are pure markup and carry neither the announcement nor the delay,
 * so composing four of them into a page still produces exactly one of each.
 *
 * The animated wrapper takes a transform for the duration of the fade, which
 * makes it a containing block for `fixed` descendants. Keep fixed chrome — a
 * sidebar, a docked bar — outside it, or wrap that chrome's own contents in a
 * {@link SkeletonReveal} instead.
 */
export function SkeletonScreen({
  label,
  className,
  children,
}: {
  /** What is being loaded, as a doctor would say it. Announced once. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <LoadingAnnouncer label={label} delayMs={SKELETON_REVEAL_MS} />
      <SkeletonReveal className={className}>{children}</SkeletonReveal>
    </>
  );
}
