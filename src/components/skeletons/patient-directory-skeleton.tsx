import { Skeleton, SkeletonGroup, SkeletonLine } from "@/components/ui/skeleton";

/**
 * Placeholder for the chart cards in `components/patients/patient-directory`.
 *
 * A directory card asks for `min-h-44`, and with a mouse it gets it: content
 * comes to 124px, the floor makes it 176. Under a finger it does not — the live
 * card is a `<button>`, and the unlayered `@media (pointer: coarse)` rule in
 * globals.css sets every button's `min-height` to 44px, which outranks a
 * layered utility whatever its specificity. The card is then 158px, content
 * height. This stands in for both, so it carries the same pair of floors and
 * the same content boxes rather than one guessed number.
 */
export function PatientDirectorySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="surface-card flex min-h-44 w-full flex-col overflow-hidden rounded-[1.4rem] p-4 [@media(pointer:coarse)]:min-h-11"
        >
          <div className="flex w-full items-start gap-3">
            <Skeleton className="size-12 shrink-0 rounded-[1rem]" />
            <div className="min-w-0 flex-1 pt-0.5">
              <SkeletonLine className="h-[22.5px] w-32" />
              <SkeletonLine className="mt-1 w-40" />
            </div>
            {/* The open affordance, which the live card draws before it knows
                anything about the patient. */}
            <Skeleton className="size-8 shrink-0 rounded-full" />
          </div>

          <div className="mt-auto grid w-full grid-cols-[auto_1fr] items-end gap-3 pt-5">
            <div>
              <Skeleton className="h-8 w-10" />
              {/* The live label is an inline span, so its line box is the
                  card's own 24px strut rather than the 16px of `text-xs`. */}
              <SkeletonLine className="h-6 w-24" />
            </div>
            <SkeletonLine className="ml-auto w-20" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
