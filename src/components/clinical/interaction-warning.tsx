"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import type { PrescriptionLine, PrescriptionWarning } from "@/lib/clinical/interactions";
import { findPrescriptionWarnings, summariseWarnings } from "@/lib/clinical/interactions";
import { cn } from "@/lib/utils";

/** How long the panel waits for typing to settle before it announces a change. */
const ANNOUNCE_AFTER_MS = 800;

/**
 * Interaction and dosage advice for the prescription being reviewed.
 *
 * This panel advises and nothing else. It cannot block a save, edit a line or
 * remove a drug — the doctor overrides it by carrying on, and the copy says so
 * where they will read it. It also never reports an all-clear: a curated table
 * can say "look at this pair", never "this prescription is safe".
 *
 * Mount it beside the medicine editor, above the save action, so the warning is
 * on screen while the prescription is still being edited rather than arriving
 * as a verdict at the end.
 */
export function InteractionWarning({
  medications,
  onFocusMedication,
  className,
}: {
  medications: readonly PrescriptionLine[];
  /** Jump to a medicine's field. Without it the drugs render as plain text. */
  onFocusMedication?: (index: number) => void;
  className?: string;
}) {
  const headingId = useId();
  const warnings = useMemo(() => findPrescriptionWarnings(medications), [medications]);
  const summary = summariseWarnings(warnings);
  const [announcement, setAnnouncement] = useState("");

  // The doctor types drug names into the editor beside this panel, so a live
  // region wired straight to the result reads out half-finished words and
  // warnings that vanish on the next keystroke. Let it settle, then say it once.
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  return (
    <>
      {/* Rendered even with nothing to say: a live region added to the page at
          the same moment as its text is announced by very few screen readers. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {warnings.length > 0 && (
        <section
          aria-labelledby={headingId}
          className={cn("surface-card rounded-xl p-3 sm:p-3.5", className)}
        >
          <div className="flex items-center gap-2">
            <TriangleAlertIcon className="size-4 shrink-0 text-warning" aria-hidden />
            <h3 id={headingId} className="text-sm font-semibold tracking-[-0.015em]">
              Worth a look before you save
            </h3>
            <Badge variant="secondary" className="tnum ml-auto">
              {warnings.length}
            </Badge>
          </div>

          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Advice only — nothing here changes or blocks the prescription, and this is not a
            complete interaction check. Your judgement decides.
          </p>

          <ul className="mt-2.5 space-y-2">
            {warnings.map((warning) => (
              <WarningCard
                key={warning.id}
                warning={warning}
                onFocusMedication={onFocusMedication}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function WarningCard({
  warning,
  onFocusMedication,
}: {
  warning: PrescriptionWarning;
  onFocusMedication?: (index: number) => void;
}) {
  const major = warning.severity === "major";
  // Three cues, not one: tint, icon and a written severity. Colour alone fails
  // anyone reading this on a washed-out phone screen in daylight, which is the
  // condition this app is actually used in.
  const Icon = major ? TriangleAlertIcon : CircleAlertIcon;

  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        major ? "border-destructive/30 bg-destructive-soft" : "border-warning/30 bg-warning-soft",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", major ? "text-destructive" : "text-warning")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold leading-5 text-foreground">{warning.headline}</p>
            <Badge variant={major ? "destructive" : "warning"}>
              {major ? "Major" : "Moderate"}
            </Badge>
          </div>

          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {warning.medicationIndexes.map((index, position) => (
              <li key={index}>
                <MedicineChip
                  label={warning.drugs[position] || `Medicine ${index + 1}`}
                  index={index}
                  onFocusMedication={onFocusMedication}
                />
              </li>
            ))}
          </ul>

          <p className="mt-2 text-xs leading-5 text-foreground">{warning.detail}</p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">Consider: </span>
            {warning.action}
          </p>
        </div>
      </div>
    </li>
  );
}

function MedicineChip({
  label,
  index,
  onFocusMedication,
}: {
  label: string;
  index: number;
  onFocusMedication?: (index: number) => void;
}) {
  const className =
    "inline-flex max-w-full items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground";

  if (!onFocusMedication) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onFocusMedication(index)}
      // The touch target is the reason for the explicit heights: this sits under
      // a thumb on a 393px screen, and a chip sized to its text is not tappable.
      className={cn(
        className,
        "pressable min-h-8 touch-manipulation hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="sr-only"> — go to medicine {index + 1}</span>
    </button>
  );
}
