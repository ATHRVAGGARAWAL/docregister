"use client";

import { useState } from "react";

import { BookOpenCheckIcon, CircleCheckIcon } from "@/components/icons";
import { useOnboardingDismissal } from "@/components/onboarding/onboarding-dismissal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OnboardingResumeButtonProps {
  /**
   * Called after the checklist is restored — use it to send the doctor to the
   * view the checklist lives on, if that is the right move from wherever this
   * is mounted.
   */
  onRestored?: () => void;
  className?: string;
}

/**
 * The way back, for a doctor who skipped setup and then wanted it.
 *
 * Renders nothing while the checklist is already showing: a control whose only
 * effect is to do nothing is worse than an absent one, and its absence is the
 * accurate answer — the checklist is on the overview where it belongs.
 *
 * Belongs in Settings, which is where someone goes looking for a thing they
 * turned off.
 */
export function OnboardingResumeButton({ onRestored, className }: OnboardingResumeButtonProps) {
  const { dismissed, restore } = useOnboardingDismissal();
  const [justRestored, setJustRestored] = useState(false);

  // Hiding it again — here or in another tab — makes the confirmation below a
  // false statement, so it goes when the fact it reports does.
  const [lastSeen, setLastSeen] = useState(dismissed);
  if (lastSeen !== dismissed) {
    setLastSeen(dismissed);
    if (dismissed === true) setJustRestored(false);
  }

  const shell = cn(
    "surface-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl px-3.5 py-3",
    className,
  );

  if (dismissed !== true) {
    // The checklist reappears on a view the doctor is probably not looking at,
    // so this line is the only report they get that the tap worked. Shown
    // rather than only announced: everyone benefits from being told.
    if (!justRestored) return null;

    return (
      <p role="status" className={cn(shell, "text-xs leading-5 text-muted-foreground")}>
        <CircleCheckIcon className="mr-2 inline-block size-4 align-text-bottom text-money" aria-hidden />
        Setup checklist restored. It is back on your overview.
      </p>
    );
  }

  return (
    <div className={shell}>
      <div className="flex min-w-0 items-start gap-2.5">
        <BookOpenCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm leading-5 font-medium tracking-[-0.01em]">Setup checklist</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Hidden on this device. It walks through your profile, dictation languages and your first
            visit.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setJustRestored(true);
          restore();
          onRestored?.();
        }}
      >
        Show it again
      </Button>
    </div>
  );
}
