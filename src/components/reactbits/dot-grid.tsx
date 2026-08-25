import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * DotGrid — React Bits' background, rebuilt as a static SVG pattern.
 *
 * The library's version is a canvas that runs a `requestAnimationFrame` loop
 * for the life of the page and pushes each dot around with GSAP's InertiaPlugin
 * on pointer move. InertiaPlugin is a paid GSAP Club plugin, the pointer
 * interaction does nothing at all on a touch device, and an always-on rAF loop
 * behind a clinical dashboard is a battery cost with no reader-facing payoff.
 *
 * So: the same mark, drawn once. A `<pattern>` of solid circles — which is a
 * pattern fill, not a gradient — tiled across the viewport. It paints on the
 * first frame, costs nothing after that, and gives the page the dot-ruled
 * ground of an engineering pad, which is the right substrate for something
 * that replaces a paper register.
 */
export function DotGrid({
  dotSize = 1.5,
  gap = 22,
  className,
}: {
  dotSize?: number;
  gap?: number;
  className?: string;
}) {
  const id = useId();

  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 -z-10 h-full w-full", className)}
    >
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={dotSize} cy={dotSize} r={dotSize} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export default DotGrid;
