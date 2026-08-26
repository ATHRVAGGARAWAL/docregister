"use client";

import { ArrowRightIcon, CalendarPlusIcon, Mic, PrinterIcon } from "@/components/icons";

import { Button } from "@/components/ui/button";
import type { CommitOutcome } from "@/lib/types";

/**
 * Drop this into the commit-success state. It deliberately owns no dashboard
 * state: the Phase 3 caller can supply a navigation callback while print links
 * remain useful in any surface (review sheet, register row, or patient chart).
 */
export function PostCommitActions({
  outcome,
  onScheduleFollowUp,
  onViewRegister,
  onStartNext,
}: {
  outcome: CommitOutcome;
  onScheduleFollowUp?: (outcome: CommitOutcome) => void;
  onViewRegister?: () => void;
  onStartNext?: () => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="Saved visit actions">
      <Button asChild variant="outline" size="lg">
        <a href={`/api/encounters/${encodeURIComponent(outcome.encounterId)}/prescription/print`} target="_blank" rel="noreferrer">
          <PrinterIcon className="size-4" aria-hidden />
          Print prescription
        </a>
      </Button>
      {onScheduleFollowUp && (
        <Button type="button" variant="outline" size="lg" onClick={() => onScheduleFollowUp(outcome)}>
          <CalendarPlusIcon className="size-4" aria-hidden />
          Schedule follow-up
        </Button>
      )}
      {onViewRegister && (
        <Button type="button" variant="secondary" size="lg" onClick={onViewRegister}>
          View register
          <ArrowRightIcon className="size-4" aria-hidden />
        </Button>
      )}
      {onStartNext && (
        <Button type="button" size="lg" onClick={onStartNext}>
          <Mic className="size-4" aria-hidden />
          Start next visit
        </Button>
      )}
    </div>
  );
}
