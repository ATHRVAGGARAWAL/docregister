"use client";

import { ArrowRightIcon, CalendarPlusIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Drop this into the commit-success state. It deliberately owns no dashboard
 * state: the Phase 3 caller can supply a navigation callback while print links
 * remain useful in any surface (review sheet, register row, or patient chart).
 */
export function PostCommitActions({
  encounterId,
  patientId,
  onScheduleFollowUp,
  onViewRegister,
}: {
  encounterId: string;
  patientId: string;
  onScheduleFollowUp?: (patientId: string, encounterId: string) => void;
  onViewRegister?: () => void;
}) {
  return (
    <div className="glass-inset flex flex-wrap items-center gap-1.5 rounded-[1rem] p-1.5" aria-label="Saved visit actions">
      <Button asChild variant="outline" size="sm" className="rounded-[0.7rem] border-white/10 bg-white/5"><a href={`/api/encounters/${encodeURIComponent(encounterId)}/prescription/print`} target="_blank" rel="noreferrer"><PrinterIcon className="size-4 text-primary" aria-hidden />Print prescription</a></Button>
      {onScheduleFollowUp && <Button type="button" variant="secondary" size="sm" className="rounded-[0.7rem] bg-primary/10 text-primary hover:bg-primary/15" onClick={() => onScheduleFollowUp(patientId, encounterId)}><CalendarPlusIcon className="size-4" aria-hidden />Schedule follow-up</Button>}
      {onViewRegister && <Button type="button" variant="ghost" size="sm" className="group rounded-[0.7rem]" onClick={onViewRegister}>View register<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></Button>}
    </div>
  );
}
