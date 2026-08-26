import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholder for the visit cards in `components/dashboard/register-timeline`.
 *
 * Everything fixed about a visit card is copied here rather than approximated —
 * the `p-4 sm:p-5` box, the 40px status mark, the status rail, the 16px time
 * column that appears at `sm`, the 26px badge that sets the height of the name
 * row, and the 30px drug chips.
 *
 * What is left is the parts a visit varies in, and those are drawn at the
 * shortest shape a real card can take: one line of diagnosis, which is the same
 * height as the icon beside it, so a one-line entry lands in exactly this
 * space. A longer entry grows the card downward rather than collapsing it, and
 * of the two directions that is the one that does not pull the row a doctor is
 * reading out from under their thumb.
 *
 * `compact` is the same switch `RegisterTimeline` takes: the overview passes it
 * and gets no day heading and no treatment column, the register does not.
 */
export function RegisterSkeleton({
  rows = 3,
  compact = false,
}: {
  rows?: number;
  compact?: boolean;
}) {
  return (
    <SkeletonGroup className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index}>
          {/* The live list heads every run of visits with its day, and the first
              row is always the start of a run. */}
          {!compact && index === 0 && (
            <div className="mb-3 flex items-center gap-3">
              <SkeletonLine className="w-36 shrink-0" />
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

          <div className="surface-card relative overflow-hidden rounded-[1.35rem] p-4 sm:p-5">
            <div className="absolute inset-y-5 left-0 w-0.5 rounded-full bg-foreground/10" />

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="hidden w-16 shrink-0 pt-1 sm:block">
                <SkeletonLine className="w-10" />
              </div>

              <Skeleton className="mt-0.5 size-10 shrink-0 rounded-xl" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The name is a link to the chart, so it carries this app's
                      44px floor on a coarse pointer and sets the row's height
                      on a phone; with a mouse the 26px badge sets it instead. */}
                  <SkeletonLine className="h-6 w-40 [@media(pointer:coarse)]:min-h-11" />
                  {/* A badge is `px-2.5 py-1` around `text-xs` inside a border:
                      26px, and taller than the name beside it. */}
                  <Skeleton className="h-6.5 w-24 rounded-full" />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <SkeletonLine className="w-14 sm:hidden" />
                  <SkeletonLine className="w-16" />
                </div>

                <div className={cn("mt-3 grid gap-2.5", !compact && "sm:grid-cols-2")}>
                  <SkeletonDetailLine />
                  {/* Diagnosis and treatment are side by side from `sm` and
                      stacked below it — two rows on a phone, not one. */}
                  {!compact && <SkeletonDetailLine />}
                </div>

                {/* Two chips, narrow enough to stay on one line at 393px: a
                    card carries up to six, and the row wraps as they land. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["w-20", "w-16"].map((width) => (
                    <div
                      key={width}
                      className="flex h-[1.875rem] items-center rounded-lg border border-border bg-secondary px-2.5"
                    >
                      <SkeletonLine className={width} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Diagnosis and treatment share one shape: a 24px tile, then `leading-5` text. */
function SkeletonDetailLine({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <Skeleton className="mt-0.5 size-6 shrink-0 rounded-lg" />
      <SkeletonLine className="h-5 w-full max-w-56" />
    </div>
  );
}
