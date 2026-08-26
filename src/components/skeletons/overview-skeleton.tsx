import { ChartSkeleton } from "@/components/skeletons/chart-skeleton";
import { RegisterSkeleton } from "@/components/skeletons/register-skeleton";
import { StatRailSkeleton } from "@/components/skeletons/stat-rail-skeleton";
import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";

/** What the overview previews before deferring to the register — `RECENT_LIMIT` there. */
const RECENT_ROWS = 5;

/**
 * Placeholder for `components/dashboard/overview-view`, in that view's own
 * order and rhythm.
 *
 * `VolumeChart` and `MixChart` are not the same height — one series and a
 * reading under the plot against two series and a legend — so the two frames
 * are asked for the shape they will actually have rather than a shared average.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-11">
      <SkeletonGroup className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div>
          <SkeletonLine className="w-40" />
          {/* The greeting's font size times its leading, at each of the three
              sizes it is set in: 1.75rem × 1.08, 2.25rem × 1.08, 2.75rem × 1.05. */}
          <Skeleton className="mt-2.5 h-[1.89rem] w-72 sm:mt-3 sm:h-[2.43rem] lg:h-[2.8875rem]" />
          <SkeletonLine className="mt-2 h-5 w-64 sm:h-6" />
        </div>
        <Skeleton className="h-11 w-48 rounded-full sm:h-12" />
      </SkeletonGroup>

      <VisitHeroSkeleton />

      <StatRailSkeleton />

      <section>
        <SkeletonGroup className="mb-4 flex flex-col justify-between gap-3 sm:mb-5 sm:flex-row sm:items-end sm:gap-4">
          <div>
            <SkeletonLine className="w-44" />
            <Skeleton className="mt-1.5 h-7 w-36" />
            <SkeletonLine className="mt-1 w-56" />
          </div>
          <div className="surface-inset inline-flex w-fit rounded-full p-1">
            {["7D", "30D", "90D"].map((label) => (
              <Skeleton
                key={label}
                className="h-8 min-w-12 rounded-full [@media(pointer:coarse)]:min-h-11"
              />
            ))}
          </div>
        </SkeletonGroup>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartSkeleton footer />
          <ChartSkeleton legend />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
        <section>
          <SkeletonGroup className="mb-4 flex items-end justify-between gap-3">
            <div>
              <SkeletonLine className="w-36" />
              <Skeleton className="mt-1.5 h-7 w-32" />
              <SkeletonLine className="mt-1 w-40" />
            </div>
            <Skeleton className="h-8 w-32 rounded-full [@media(pointer:coarse)]:min-h-11" />
          </SkeletonGroup>
          <RegisterSkeleton rows={RECENT_ROWS} compact />
        </section>

        <RecallCardSkeleton />
      </div>
    </div>
  );
}

/**
 * The live hero is a two-column card. On a phone its `min-h-[12rem]` floor sets
 * the height, but from `md` the right column outgrows the floor and the
 * sparkline sets it instead — so the caption row and the two wrapped lines of
 * the blurb above it are load-bearing here, not decoration.
 */
function VisitHeroSkeleton() {
  return (
    <SkeletonGroup className="surface-elevated grid min-h-[12rem] grid-cols-[8rem_1fr] overflow-hidden rounded-[1.25rem] md:min-h-[18rem] md:grid-cols-[minmax(15rem,0.72fr)_minmax(22rem,1.28fr)]">
      <div className="flex flex-col justify-between border-r border-border p-3.5 sm:p-6">
        <div>
          {/* 11px in the inherited 1.5 line box, then 12px in the 4/3 one that
              `text-xs` brings with it. */}
          <SkeletonLine className="h-[16.5px] w-20 sm:h-4 sm:w-28" />
          {/* `sm:text-[13px]` replaces only the size, so that same 4/3 ratio
              stays applied and the line box grows with the type. */}
          <SkeletonLine className="mt-3 h-4 w-16 sm:mt-5 sm:h-[17.33px] sm:w-24" />
          {/* 3rem and 5rem of digits at `leading-[0.9]`. */}
          <Skeleton className="mt-1 h-[2.7rem] w-20 sm:h-[4.5rem] sm:w-28" />
        </div>
        {/* The delta pill: a 12px line, 6px of padding either side, 1px border. */}
        <Skeleton className="mt-3 h-7.5 w-24 rounded-full sm:mt-8 sm:w-36" />
      </div>

      <div className="flex min-w-0 flex-col justify-between p-3.5 sm:min-h-[16rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="w-32" />
            {/* Fixed copy held to `max-w-sm`, where it takes two `leading-6`
                lines at every width it is shown at. */}
            <div className="mt-1.5 hidden max-w-sm sm:block">
              <SkeletonLine className="h-6 w-full" />
              <SkeletonLine className="h-6 w-2/3" />
            </div>
          </div>
          <Skeleton className="hidden size-10 shrink-0 rounded-2xl sm:block" />
        </div>
        <div className="mt-2 sm:mt-7">
          <Skeleton className="h-20 w-full rounded-xl sm:h-36" />
          <div className="mt-1 flex items-center justify-between">
            <SkeletonLine className="h-[15px] w-16 sm:h-4 sm:w-24" />
            {/* The peak reading joins the row at `sm` and is taller than the day
                labels beside it, so it sets the row's height from there up. */}
            <Skeleton className="hidden h-6.5 w-24 rounded-full sm:block" />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** The recall card beside the recent visits: fixed copy, one button, `sm:min-h-72`. */
function RecallCardSkeleton() {
  return (
    <SkeletonGroup className="surface-elevated h-fit overflow-hidden rounded-[1.5rem] p-5 sm:min-h-72 sm:p-7">
      <div className="flex items-center justify-between">
        <Skeleton className="size-11 rounded-[1.1rem]" />
        <Skeleton className="size-4 rounded-sm" />
      </div>
      <SkeletonLine className="mt-5 w-32 sm:mt-8" />
      <Skeleton className="mt-2 h-7 w-56" />
      <SkeletonLine className="mt-3 h-6 w-full" />
      <SkeletonLine className="mt-0 h-6 w-4/5" />
      <Skeleton className="mt-5 h-10 w-full rounded-full sm:mt-7 [@media(pointer:coarse)]:min-h-11" />
    </SkeletonGroup>
  );
}
