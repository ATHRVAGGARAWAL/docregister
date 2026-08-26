import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";
import { OverviewSkeleton } from "@/components/skeletons/overview-skeleton";
import { SkeletonReveal, SkeletonScreen } from "@/components/skeletons/skeleton-screen";
import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";

/** As many rows as `AppNavigation` has workspaces. */
const NAV_ITEMS = 7;

/**
 * The fallback for the workspace route, streamed before the dashboard's data or
 * its JavaScript arrive.
 *
 * It is the dashboard's own shell — the same 16rem sidebar, the same two 56px
 * headers, the same `main` box — so the register does not slide sideways or
 * upward when the real thing replaces it. The brand is drawn for real, because
 * it is not something that loads.
 *
 * Everything a doctor could press is a placeholder rather than the real label:
 * the controls do not work yet, and a menu that reads "Register" but does
 * nothing when tapped is worse than one that plainly is not ready.
 *
 * The fixed chrome sits outside the animated wrapper on purpose. `animate-in`
 * carries a transform for the length of the fade, and a transformed ancestor
 * becomes the containing block for `fixed` children — the sidebar would anchor
 * to the page instead of the viewport and then jump back when the fade ended.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <aside
        aria-hidden
        className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-background lg:flex lg:flex-col"
      >
        <div className="border-b border-border px-5 py-5">
          <BrandLockup subtitle="Clinical workspace" />
        </div>

        <SkeletonReveal className="flex min-h-0 flex-1 flex-col">
          <SkeletonGroup className="surface-inset mx-4 mt-4 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className="h-5 w-28" />
                <SkeletonLine className="mt-0.5 w-20" />
              </div>
            </div>
            <Skeleton className="mt-3 h-6.5 w-32 rounded-full" />
          </SkeletonGroup>

          <SkeletonGroup className="flex-1 space-y-1 px-3 py-4">
            {Array.from({ length: NAV_ITEMS }, (_, index) => (
              <div key={index} className="flex h-11 items-center gap-3 rounded-lg px-3">
                <Skeleton className="size-4.5 shrink-0 rounded-sm" />
                <SkeletonLine className="w-24" />
              </div>
            ))}
          </SkeletonGroup>

          <SkeletonGroup className="space-y-3 border-t border-border p-4">
            <Skeleton className="h-10 w-full rounded-lg [@media(pointer:coarse)]:min-h-11" />
            <div className="flex items-center justify-between gap-3">
              <div className="surface-inset inline-flex items-center gap-0.5 p-1">
                {["system", "light", "dark"].map((mode) => (
                  <Skeleton
                    key={mode}
                    className="h-8 w-11 rounded-md [@media(pointer:coarse)]:min-h-11"
                  />
                ))}
              </div>
              <Skeleton className="size-10 shrink-0 rounded-lg" />
            </div>
            <div className="flex items-start gap-2">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className="h-5 w-full" />
                <SkeletonLine className="h-5 w-3/5" />
              </div>
            </div>
          </SkeletonGroup>
        </SkeletonReveal>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
        {/* The menu trigger's 44px box, held so the brand beside it does not
            shift left when the real header mounts. */}
        <SkeletonReveal className="size-11 shrink-0 p-2.5">
          <SkeletonGroup className="grid h-full place-items-center">
            <Skeleton className="h-4 w-5 rounded-sm" />
          </SkeletonGroup>
        </SkeletonReveal>
        <BrandMark compact />
        <SkeletonReveal className="min-w-0 flex-1">
          <SkeletonGroup>
            <SkeletonLine className="h-5 w-24" />
          </SkeletonGroup>
        </SkeletonReveal>
      </header>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 hidden border-b border-border bg-background lg:block">
          <SkeletonReveal className="mx-auto flex h-14 max-w-[94rem] items-center justify-between gap-4 px-8">
            <SkeletonGroup className="min-w-0">
              <SkeletonLine className="h-5 w-24" />
              <SkeletonLine className="mt-0.5 w-36" />
            </SkeletonGroup>
            <SkeletonGroup className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-md [@media(pointer:coarse)]:min-h-11" />
              <div className="surface-inset inline-flex items-center gap-0.5 p-1">
                {["system", "light", "dark"].map((mode) => (
                  <Skeleton
                    key={mode}
                    className="h-8 w-11 rounded-md [@media(pointer:coarse)]:min-h-11"
                  />
                ))}
              </div>
            </SkeletonGroup>
          </SkeletonReveal>
        </header>

        <main className="mx-auto w-full max-w-[94rem] px-4 pb-[calc(var(--dock-height,7rem)+1.5rem)] pt-20 sm:px-6 lg:px-8 lg:pt-6">
          <SkeletonScreen label="Loading your workspace">
            <OverviewSkeleton />
          </SkeletonScreen>
        </main>
      </div>
    </div>
  );
}
