"use client";

import {
  ArrowUpRightIcon,
  CircleCheckIcon,
  ClipboardPenLineIcon,
  HistoryIcon,
  type IconProps,
  NotebookPenIcon,
  PillIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "@/components/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock, formatDayLong } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type VisitStatus = RegisterEntry["status"];

/** `rail` is the stripe down the card's left edge; `mark` is the icon tile by the name. */
const STATUS_STYLE: Record<VisitStatus, { rail: string; mark: string }> = {
  committed: {
    rail: "bg-primary",
    mark: "border-primary/20 bg-primary-soft text-primary",
  },
  draft: {
    rail: "bg-warning",
    mark: "border-warning/25 bg-warning-soft text-warning",
  },
  discarded: {
    rail: "bg-muted-foreground/50",
    mark: "border-border bg-secondary text-muted-foreground",
  },
};

const STATUS_ICON: Record<VisitStatus, ComponentType<IconProps>> = {
  committed: CircleCheckIcon,
  draft: ClipboardPenLineIcon,
  discarded: HistoryIcon,
};

type VisitActions = {
  onOpenPatient?: (patient: PatientMatch) => void;
  onOpenDraft?: (entry: RegisterEntry) => void;
  onRestoreDraft?: (entry: RegisterEntry) => void;
  onOpenVisit?: (entry: RegisterEntry) => void;
};

export function RegisterTimeline({
  entries,
  compact = false,
  // Only the caller knows which slice of the register it handed over — Overview
  // passes today's visits, the register passes a filtered page — so the default
  // says this list is empty and claims nothing about the register behind it. A
  // default like "no visits recorded yet" would tell a doctor who saw ten
  // patients yesterday and none yet today that the whole register was gone.
  // Callers that know their own scope pass copy that says so.
  emptyTitle = "No visits to show",
  emptyHint = "Dictate a visit and it appears here.",
  onOpenPatient,
  onOpenDraft,
  onRestoreDraft,
  onOpenVisit,
}: {
  entries: RegisterEntry[];
  compact?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
} & VisitActions) {
  const reduceMotion = useReducedMotion();

  if (entries.length === 0) {
    return (
      <div className="surface-card relative overflow-hidden rounded-[1.5rem] px-6 py-14 text-center">
        <span className="relative mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-primary-soft text-primary">
          <NotebookPenIcon className="size-5" aria-hidden />
        </span>
        <p className="relative mt-4 text-sm font-semibold tracking-[-0.01em]">{emptyTitle}</p>
        <p className="relative mt-1 text-xs leading-5 text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      <AnimatePresence initial={false} mode="popLayout">
        {entries.map((entry, index) => {
          const day = entry.occurred_at.slice(0, 10);
          const previousDay = entries[index - 1]?.occurred_at.slice(0, 10);
          const showDay = !compact && day !== previousDay;

          return (
            <motion.li
              layout={!reduceMotion}
              key={entry.id}
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.985 }}
              transition={{
                duration: reduceMotion ? 0 : 0.42,
                delay: reduceMotion ? 0 : Math.min(index, 7) * 0.045,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {showDay && <DayHeading day={day} />}
              <VisitCard
                entry={entry}
                compact={compact}
                onOpenPatient={onOpenPatient}
                onOpenDraft={onOpenDraft}
                onRestoreDraft={onRestoreDraft}
                onOpenVisit={onOpenVisit}
              />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

// A day heading is always the first child of its <li>, so a margin-top here could only
// ever land on :first-child. The air between days is the list's own row spacing.
function DayHeading({ day }: { day: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {formatDayLong(day)}
      </p>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

function VisitCard({
  entry,
  compact,
  onOpenPatient,
  onOpenDraft,
  onRestoreDraft,
  onOpenVisit,
}: {
  entry: RegisterEntry;
  compact: boolean;
} & VisitActions) {
  const day = entry.occurred_at.slice(0, 10);
  const canOpenVisit = entry.status === "committed" && Boolean(onOpenVisit);
  const style = STATUS_STYLE[entry.status];
  const StatusIcon = STATUS_ICON[entry.status];
  const drugLimit = compact ? 3 : 6;
  const undisplayedDrugs = entry.drugs.length - drugLimit;

  return (
    <article
      className={cn(
        "surface-card group relative isolate overflow-hidden rounded-[1.35rem] p-4 transition-all duration-300 sm:p-5",
        canOpenVisit && "hover:-translate-y-0.5 hover:border-primary/20",
      )}
    >
      <div
        className={cn("pointer-events-none absolute inset-y-5 left-0 w-0.5 rounded-full", style.rail)}
        aria-hidden
      />
      {canOpenVisit && (
        <button
          type="button"
          onClick={() => onOpenVisit?.(entry)}
          className="absolute inset-0 z-0 rounded-[1.35rem] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Open ${entry.patient_name}'s visit from ${formatDayLong(day)} at ${formatClock(entry.occurred_at)}`}
        />
      )}

      <div className={cn("relative z-10 flex items-start gap-3 sm:gap-4", canOpenVisit && "pointer-events-none")}>
        <div className="hidden w-16 shrink-0 pt-1 sm:block">
          <time
            dateTime={entry.occurred_at}
            className="tnum text-xs font-medium text-muted-foreground"
          >
            {formatClock(entry.occurred_at)}
          </time>
        </div>

        <span
          className={cn(
            "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border",
            style.mark,
          )}
        >
          <StatusIcon className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {entry.patient_id && onOpenPatient ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPatient({
                        id: entry.patient_id!,
                        full_name: entry.patient_name,
                        phone: null,
                        age_years: entry.age_years,
                        last_visit: entry.occurred_at,
                        visit_count: entry.visit_number,
                      })
                    }
                    // min-w matters as much as min-h here: short names ("Om", "Raj")
                    // are common and would otherwise leave a ~30px-wide touch target.
                    className="pointer-events-auto relative z-20 inline-flex touch-manipulation items-center rounded-md text-left text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 sm:text-base"
                  >
                    {entry.patient_name}
                  </button>
                ) : (
                  <h3 className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground sm:text-base">
                    {entry.patient_name}
                  </h3>
                )}
                <VisitBadge entry={entry} />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={entry.occurred_at} className="tnum sm:hidden">
                  {formatClock(entry.occurred_at)}
                </time>
                {entry.age_years !== null && (
                  <span className="flex items-center gap-1">
                    <UserRoundIcon className="size-3" aria-hidden /> {entry.age_years} years
                  </span>
                )}
              </p>
            </div>

            {canOpenVisit && (
              <span className="hidden items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors group-hover:text-primary md:flex">
                Open <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </span>
            )}
          </div>

          {entry.status === "draft" && onOpenDraft && (
            <button
              type="button"
              onClick={() => onOpenDraft(entry)}
              className="pointer-events-auto relative z-20 mt-3 inline-flex min-h-9 touch-manipulation items-center rounded-xl border border-warning/25 bg-warning-soft px-3 text-xs font-semibold text-warning transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11"
            >
              Review this draft
            </button>
          )}

          {entry.status === "discarded" && onRestoreDraft && (
            <button
              type="button"
              onClick={() => onRestoreDraft(entry)}
              className="pointer-events-auto relative z-20 mt-3 inline-flex min-h-9 touch-manipulation items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11"
            >
              <HistoryIcon className="size-3.5" aria-hidden />
              Restore &amp; review
            </button>
          )}

          <div className="mt-3 grid gap-2.5 text-sm sm:grid-cols-2">
            <p className="flex min-w-0 items-start gap-2.5 leading-5 text-muted-foreground">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <StethoscopeIcon className="size-3.5" aria-hidden />
              </span>
              <span className={compact ? "line-clamp-1" : "line-clamp-2"}>
                {entry.diagnosis || "Diagnosis not recorded"}
              </span>
            </p>
            {!compact && entry.treatment && (
              <p className="flex min-w-0 items-start gap-2.5 leading-5 text-muted-foreground">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <ClipboardPenLineIcon className="size-3.5" aria-hidden />
                </span>
                <span className="line-clamp-2">{entry.treatment}</span>
              </p>
            )}
          </div>

          {entry.drugs.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {entry.drugs.slice(0, drugLimit).map((drug) => (
                <li
                  key={drug}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground"
                >
                  <PillIcon className="size-3 text-primary/75" aria-hidden />
                  {drug}
                </li>
              ))}
              {undisplayedDrugs > 0 && (
                <li className="px-1 py-1.5 text-xs text-muted-foreground">
                  +{undisplayedDrugs} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

function VisitBadge({ entry }: { entry: RegisterEntry }) {
  if (entry.status === "draft") {
    return (
      <Badge variant="warning" className="rounded-full border-warning/20 bg-warning-soft px-2.5">
        Needs review
      </Badge>
    );
  }
  if (entry.status === "discarded") {
    return (
      <Badge
        variant="secondary"
        className="rounded-full border-border bg-secondary px-2.5 text-muted-foreground"
      >
        Discarded
      </Badge>
    );
  }
  if (entry.is_new_patient) {
    return (
      <Badge variant="default" className="rounded-full border-primary/20 bg-primary-soft px-2.5 text-primary">
        First visit
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="rounded-full border-border bg-secondary px-2.5">
      Visit {entry.visit_number ?? "return"}
    </Badge>
  );
}
