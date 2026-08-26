import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One placeholder block.
 *
 * The tint is mixed from `--foreground` rather than taken from `--secondary`,
 * `--muted` or `--card`: in the light theme those three are all `#f5f5f7`, so a
 * placeholder painted with any of them is invisible on every card in this app.
 * Mixing against the text colour instead gives a mark that reads on `--card`
 * and on `--background`, in both themes, without adding a colour to the
 * palette.
 *
 * Static on purpose — the pulse belongs to `SkeletonGroup`, one animation for a
 * whole shape rather than one per bar.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" className={cn("rounded-md bg-foreground/10", className)} {...props} />
  );
}

/**
 * One line of placeholder text.
 *
 * The height is the line box of the text this stands in — `h-4` for `text-xs`,
 * `h-5` for `leading-5`, `h-7` for `text-[1.75rem] leading-none` — so a stack
 * of these measures exactly what the paragraph will and nothing shifts when the
 * words arrive. The bar is then painted shorter than that box by a transform,
 * which changes what is seen without changing what is measured; a bar as tall
 * as its own line box reads as a filled field rather than as a word.
 */
function SkeletonLine({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Skeleton
      data-slot="skeleton-line"
      className={cn("h-4 origin-center scale-y-[0.6] rounded-full", className)}
      {...props}
    />
  );
}

/**
 * The root of a placeholder shape, and the only thing that animates.
 *
 * Hidden from assistive technology here rather than at each call site: a
 * placeholder has nothing to announce, and the screen it belongs to announces
 * itself once through `SkeletonScreen`. Nesting groups is harmless — an
 * `aria-hidden` subtree stays hidden however deep it is.
 *
 * `motion-safe:` rather than an unconditional pulse: under a reduced-motion
 * preference the utility is never emitted at all, leaving the tint sitting
 * still instead of relying on the global animation-duration override to stop
 * it mid-fade.
 */
function SkeletonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-group"
      aria-hidden
      className={cn("motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton, SkeletonGroup, SkeletonLine };
