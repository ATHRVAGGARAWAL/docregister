import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";

/** X tick placeholders. Recharts thins real ticks by `minTickGap`, so this is a look, not a count. */
const TICKS = 5;

/**
 * Placeholder for a chart drawn in `components/charts/chart-chrome`'s frame.
 *
 * The plot is one block rather than a drawn line or a run of bars: a shape that
 * looks plotted is a shape a doctor can read a trend off, and there is no trend
 * here yet. Its box is the frame's own `h-48 sm:h-60`, so the height is right
 * whatever is inside it.
 *
 * `legend` and `footer` mirror the two frames actually in use — `MixChart` has
 * two series and so a legend, `VolumeChart` has one series and a reading under
 * the plot — because those two rows are the whole height difference between
 * them.
 */
export function ChartSkeleton({
  legend = false,
  footer = false,
}: {
  legend?: boolean;
  footer?: boolean;
}) {
  return (
    <SkeletonGroup className="surface-card rounded-[1.9rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* The frame's title is 15px with no leading of its own, so it sits
              in the inherited 1.5 line box: 22.5px, not the 20px a `text-sm`
              heading would take. */}
          <SkeletonLine className="h-[22.5px] w-32" />
          <SkeletonLine className="mt-1 h-5 w-44" />
        </div>
        {/* The data-table toggle, which the frame renders whether or not the
            chart has resolved. */}
        <Skeleton className="size-9 shrink-0 rounded-full" />
      </div>

      {legend && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {["w-12", "w-20"].map((width) => (
            <div key={width} className="flex h-4 items-center gap-2">
              <Skeleton className="h-1.5 w-5 rounded-full" />
              <SkeletonLine className={width} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <div className="flex h-48 w-full flex-col sm:h-60">
          <Skeleton className="min-h-0 flex-1 rounded-xl" />
          <div className="mt-2 flex items-center justify-between gap-2">
            {Array.from({ length: TICKS }, (_, index) => (
              <SkeletonLine key={index} className="h-3 w-8" />
            ))}
          </div>
        </div>
      </div>

      {footer && <SkeletonLine className="mt-1 ml-auto h-4 w-24" />}
    </SkeletonGroup>
  );
}
