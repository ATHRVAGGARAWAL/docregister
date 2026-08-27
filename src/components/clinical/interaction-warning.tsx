"use client";

import { CircleAlertIcon, TriangleAlertIcon } from "@/components/icons";
import { findInteractions, type PrescribedDrug } from "@/lib/clinical/interactions";
import { cn } from "@/lib/utils";

/**
 * Interactions raised by the prescription currently under review.
 *
 * Sits beside the review a doctor is already doing. It cannot block the commit,
 * cannot edit a line, and has no confirm step of its own — the doctor reads it
 * and decides, exactly as they would a note from a pharmacist.
 *
 * The last line is not a disclaimer bolted on for cover. Four rules is a small
 * enough number that a doctor could reasonably assume a silent panel means
 * "checked and clear", and it does not mean that. Saying so is what keeps this
 * from being worse than showing nothing.
 */
export function InteractionWarnings({
  prescription,
  className,
}: {
  prescription: readonly PrescribedDrug[];
  className?: string;
}) {
  const findings = findInteractions(prescription);
  if (findings.length === 0) return null;

  return (
    <section
      aria-label="Prescription interaction notes"
      className={cn("space-y-2", className)}
    >
      {findings.map((finding) => {
        const severe = finding.severity === "contraindicated";
        return (
          <div
            key={finding.id}
            // `alert` for the contraindication only. A screen reader
            // interrupting for every duplicate-NSAID note would make the
            // interruption meaningless when it matters.
            role={severe ? "alert" : undefined}
            className={cn(
              "rounded-xl border px-3.5 py-3",
              severe
                ? "border-destructive/40 bg-destructive/10"
                : "border-warning/40 bg-warning-soft",
            )}
          >
            <p className="flex items-start gap-2 text-sm font-semibold">
              {severe ? (
                <TriangleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <CircleAlertIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>
                {/* The severity is in the words, not only the colour. */}
                {severe ? "Do not combine: " : "Check: "}
                {finding.headline}
              </span>
            </p>

            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{finding.detail}</p>

            <p className="text-muted-foreground mt-2 text-[11px]">
              {finding.drugs.join("  +  ")} · {finding.source}
            </p>
          </div>
        );
      })}

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        These are four common interactions, not a full check. Nothing here is blocked — you
        decide what to prescribe.
      </p>
    </section>
  );
}
