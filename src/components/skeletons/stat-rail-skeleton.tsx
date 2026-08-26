import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** `StatRail` renders exactly four readings, so the placeholder is not a count prop. */
const TILES = 4;

/**
 * Placeholder for `components/dashboard/stat-rail`.
 *
 * Carries the rail's own grid, tile padding and divider rules rather than an
 * approximation of them: the tile height is set by `min-h-28` / `sm:min-h-32`
 * in both, so copying the container is what makes the two the same height at
 * every breakpoint, whatever the numbers turn out to be.
 */
export function StatRailSkeleton() {
  return (
    <SkeletonGroup className="surface-card grid grid-cols-2 overflow-hidden rounded-[1.35rem] sm:grid-cols-4 sm:rounded-[1.75rem]">
      {Array.from({ length: TILES }, (_, index) => (
        <div
          key={index}
          className={cn(
            "min-h-28 px-3.5 py-4 sm:min-h-32 sm:px-6 sm:py-5",
            index % 2 === 1 && "border-l border-border",
            index >= 2 && "border-t border-border sm:border-t-0",
            index > 0 && "sm:border-l",
          )}
        >
          <div className="flex items-center gap-2">
            {/* The live tile paints this swatch in a chart colour. A placeholder
                cannot know which reading it will be, and guessing one would
                claim a series that may not be there. */}
            <Skeleton className="h-1.5 w-5 rounded-full" />
            <SkeletonLine className="h-3 w-20 sm:h-4 sm:w-24" />
          </div>
          {/* The figure is `leading-none`, so its line box is its font size. */}
          <Skeleton className="mt-2.5 h-7 w-14 sm:mt-3 sm:h-8 sm:w-16" />
          <SkeletonLine className="mt-2 h-3.5 w-24 sm:h-4 sm:w-28" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
