"use client";

import {
  CircleCheckIcon,
  ClipboardPenLineIcon,
  NotebookPenIcon,
  PillIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";

import { AnimatedItem } from "@/components/reactbits/reveal";
import { Badge } from "@/components/ui/badge";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock, formatDayLong, formatINR } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";

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
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <NotebookPenIcon className="size-5" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-medium">No matching visits found.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Dictate a visit or adjust the register filters.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => {
        const day = entry.occurred_at.slice(0, 10);
        const previousDay = entries[index - 1]?.occurred_at.slice(0, 10);
        const showDay = !compact && day !== previousDay;

        return (
          <AnimatedItem as="li" key={entry.id} index={index}>
            {showDay && (
              <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground first:mt-0">
                {formatDayLong(day)}
              </p>
            )}
            <article
              className="group cursor-pointer rounded-xl border border-border bg-card p-4 shadow-flat transition-colors hover:border-primary/20 sm:p-5"
              role={onOpenVisit ? "button" : undefined}
              tabIndex={onOpenVisit ? 0 : undefined}
              onClick={() => onOpenVisit?.(entry)}
              onKeyDown={(event) => {
                if (onOpenVisit && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onOpenVisit(entry);
                }
              }}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="hidden w-16 shrink-0 pt-0.5 sm:block">
                  <p className="tnum text-xs font-medium text-muted-foreground">
                    {formatClock(entry.occurred_at)}
                  </p>
                </div>

                <span
                  className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border ${
                    entry.status === "draft"
                      ? "border-money/25 bg-money/10 text-money"
                      : "border-primary/20 bg-primary/10 text-primary"
                  }`}
                >
                  {entry.status === "draft" ? (
                    <ClipboardPenLineIcon className="size-4" aria-hidden />
                  ) : (
                    <CircleCheckIcon className="size-4" aria-hidden />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.patient_id && onOpenPatient ? (
                          <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenPatient({
                                  id: entry.patient_id!,
                                  full_name: entry.patient_name,
                                  phone: null,
                                  age_years: entry.age_years,
                                  last_visit: entry.occurred_at,
                                  visit_count: entry.visit_number,
                                });
                            }}
                            className="rounded-sm text-left font-semibold tracking-tight underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {entry.patient_name}
                          </button>
                        ) : (
                          <h3 className="font-semibold tracking-tight">{entry.patient_name}</h3>
                        )}
                        {entry.status === "draft" ? (
                          <Badge variant="money">Needs review</Badge>
                        ) : entry.is_new_patient ? (
                          <Badge variant="default">First visit</Badge>
                        ) : (
                          <Badge variant="secondary">
                            Visit {entry.visit_number ?? "return"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
                        <span>{formatClock(entry.occurred_at)}</span>
                        {entry.age_years !== null && (
                          <span className="flex items-center gap-1">
                            <UserRoundIcon className="size-3" aria-hidden /> {entry.age_years} years
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-semibold text-money">
                      {entry.fees_inr !== null ? formatINR(entry.fees_inr) : "—"}
                    </p>
                  </div>

                  {entry.status === "draft" && onOpenDraft && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDraft(entry);
                      }}
                      className="mt-3 inline-flex items-center rounded-md border border-money/35 bg-money/10 px-2.5 py-1.5 text-xs font-medium text-money transition-colors hover:bg-money/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Review this draft
                    </button>
                  )}

                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                      <StethoscopeIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                      <span className={compact ? "line-clamp-1" : "line-clamp-2"}>
                        {entry.diagnosis || "Diagnosis not recorded"}
                      </span>
                    </p>
                    {!compact && entry.treatment && (
                      <p className="flex min-w-0 items-start gap-2 text-muted-foreground">
                        <ClipboardPenLineIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="line-clamp-2">{entry.treatment}</span>
                      </p>
                    )}
                  </div>

                  {entry.drugs.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {entry.drugs.slice(0, compact ? 3 : 6).map((drug) => (
                        <li
                          key={drug}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/65 px-2 py-1 text-[11px] text-secondary-foreground"
                        >
                          <PillIcon className="size-3 text-muted-foreground" aria-hidden />
                          {drug}
                        </li>
                      ))}
                      {entry.drugs.length > (compact ? 3 : 6) && (
                        <li className="px-1 py-1 text-[11px] text-muted-foreground">
                          +{entry.drugs.length - (compact ? 3 : 6)} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          </AnimatedItem>
        );
      })}
    </ol>
  );
}
