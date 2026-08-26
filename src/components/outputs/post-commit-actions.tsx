"use client";

import { ArrowRightIcon, CalendarPlusIcon, Mic } from "@/components/icons";

import { Button } from "@/components/ui/button";
import type { CommitOutcome } from "@/lib/types";

/**
 * Drop this into the commit-success state. It deliberately owns no dashboard
 * state: the caller supplies the navigation actions that are relevant after a
 * visit is saved.
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
