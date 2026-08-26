import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";

/**
 * Placeholder for the ledger in `components/accounts/accounts-workspace`.
 *
 * It stands in the same slot as the live list — inside the filter card, with
 * that list's own `p-3 sm:p-4` and two-column break at `lg` — so the card it
 * sits in does not resize when the entries land.
 *
 * A row's status slot is either a 26px "Paid" badge or a "Mark paid" button —
 * and that button is 28px under a mouse but 44px under a finger, because every
 * button in this app carries a 44px floor on a coarse pointer. Three possible
 * heights, so the slot is drawn at the smallest of them: rows grow downward as
 * they resolve rather than pulling the ledger up out from under a thumb.
 */
export function AccountsLedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonGroup className="grid gap-2.5 p-3 sm:p-4 lg:grid-cols-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="surface-inset relative overflow-hidden rounded-[1.2rem] p-4">
          <div className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-foreground/10" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Skeleton className="size-9 shrink-0 rounded-[0.85rem]" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className="h-5 w-28" />
                <SkeletonLine className="mt-1 w-40" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <SkeletonLine className="w-32" />
            <Skeleton className="h-6.5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
