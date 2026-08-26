"use client";

import {
  ArrowUpRightIcon,
  CircleCheckIcon,
  ClipboardPenLineIcon,
  NotebookPenIcon,
  PillIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock, formatDayLong } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RegisterTimeline({
  entries,
  compact = false,
  onOpenPatient,
  onOpenDraft,
  onOpenVisit,
}: {
  entries: RegisterEntry[];
  compact?: boolean;
  onOpenPatient?: (patient: PatientMatch) => void;
  onOpenDraft?: (entry: RegisterEntry) => void;
  onOpenVisit?: (entry: RegisterEntry) => void;
}) {
  const reduceMotion = useReducedMotion();

  if (entries.length === 0) {
    return (
      <div className="glass-card relative overflow-hidden rounded-[1.5rem] px-6 py-14 text-center">
        <div className="pointer-events-none absolute inset-x-1/4 -top-20 h-36 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <span className="relative mx-auto grid size-12 place-items-center rounded-2xl border border-white/10 bg-primary/10 text-primary shadow-[0_14px_30px_-18px_var(--primary)]">
          <NotebookPenIcon className="size-5" aria-hidden />
        </span>
        <p className="relative mt-4 text-sm font-semibold tracking-[-0.01em]">No matching visits found</p>
        <p className="relative mt-1 text-xs leading-5 text-muted-foreground">
          Dictate a visit or adjust the register filters.
        </p>
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
              {showDay && (
                <div className="mb-3 mt-7 flex items-center gap-3 first:mt-0">
                  <p className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {formatDayLong(day)}
                  </p>
                  <span className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" aria-hidden />
                </div>
              )}

              <article
                className={cn(
                  "glass-card group relative isolate overflow-hidden rounded-[1.35rem] p-4 transition-all duration-300 sm:p-5",
                  onOpenVisit && "hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_24px_60px_-36px_var(--primary)]",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-5 left-0 w-0.5 rounded-full",
                    entry.status === "draft" ? "bg-warning/70" : "bg-primary/70",
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    "pointer-events-none absolute -right-12 -top-16 size-40 rounded-full blur-3xl transition-opacity duration-300",
                    entry.status === "draft" ? "bg-warning/8" : "bg-primary/8",
                    "opacity-40 group-hover:opacity-80",
                  )}
                  aria-hidden
                />

                {onOpenVisit && (
                  <button
                    type="button"
                    onClick={() => onOpenVisit(entry)}
                    className="absolute inset-0 z-0 rounded-[1.35rem] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Open ${entry.patient_name}'s visit from ${formatDayLong(day)} at ${formatClock(entry.occurred_at)}`}
                  />
                )}

                <div className={cn("relative z-10 flex items-start gap-3 sm:gap-4", onOpenVisit && "pointer-events-none")}>
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
                      "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                      entry.status === "draft"
                        ? "border-warning/25 bg-warning/10 text-warning"
                        : "border-primary/20 bg-primary/10 text-primary",
                    )}
                  >
                    {entry.status === "draft" ? (
                      <ClipboardPenLineIcon className="size-4" aria-hidden />
                    ) : (
                      <CircleCheckIcon className="size-4" aria-hidden />
                    )}
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
                              className="pointer-events-auto relative z-20 inline-flex touch-manipulation items-center rounded-md text-left text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11 sm:text-base"
                            >
                              {entry.patient_name}
                            </button>
                          ) : (
                            <h3 className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground sm:text-base">
                              {entry.patient_name}
                            </h3>
                          )}
                          {entry.status === "draft" ? (
                            <Badge variant="warning" className="rounded-full border-warning/20 bg-warning/8 px-2.5">Needs review</Badge>
                          ) : entry.is_new_patient ? (
                            <Badge variant="default" className="rounded-full border-primary/20 bg-primary/8 px-2.5">First visit</Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-full border-white/8 bg-white/5 px-2.5">
                              Visit {entry.visit_number ?? "return"}
                            </Badge>
                          )}
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

                      {onOpenVisit && (
                        <span className="hidden items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors group-hover:text-primary md:flex">
                          Open <ArrowUpRightIcon className="size-3.5" aria-hidden />
                        </span>
                      )}
                    </div>

                    {entry.status === "draft" && onOpenDraft && (
                      <button
                        type="button"
                        onClick={() => onOpenDraft(entry)}
                        className="pointer-events-auto relative z-20 mt-3 inline-flex min-h-9 touch-manipulation items-center rounded-xl border border-warning/25 bg-warning/10 px-3 text-xs font-semibold text-warning transition-colors hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11"
                      >
                        Review this draft
                      </button>
                    )}

                    <div className="mt-3 grid gap-2.5 text-sm sm:grid-cols-2">
                      <p className="flex min-w-0 items-start gap-2.5 leading-5 text-muted-foreground">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                          <StethoscopeIcon className="size-3.5" aria-hidden />
                        </span>
                        <span className={compact ? "line-clamp-1" : "line-clamp-2"}>
                          {entry.diagnosis || "Diagnosis not recorded"}
                        </span>
                      </p>
                      {!compact && entry.treatment && (
                        <p className="flex min-w-0 items-start gap-2.5 leading-5 text-muted-foreground">
                          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                            <ClipboardPenLineIcon className="size-3.5" aria-hidden />
                          </span>
                          <span className="line-clamp-2">{entry.treatment}</span>
                        </p>
                      )}
                    </div>

                    {entry.drugs.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {entry.drugs.slice(0, compact ? 3 : 6).map((drug) => (
                          <li
                            key={drug}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1.5 text-[0.6875rem] text-secondary-foreground"
                          >
                            <PillIcon className="size-3 text-primary/75" aria-hidden />
                            {drug}
                          </li>
                        ))}
                        {entry.drugs.length > (compact ? 3 : 6) && (
                          <li className="px-1 py-1.5 text-[0.6875rem] text-muted-foreground">
                            +{entry.drugs.length - (compact ? 3 : 6)} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
