"use client";

import { useCallback, useId, type ReactNode } from "react";

import {
  BanknoteIcon,
  CalendarClockIcon,
  HistoryIcon,
  PillIcon,
  StethoscopeIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { formatClock, formatINR } from "@/lib/format";
import type { PatientHistoryEncounter } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TimelineEncounterStatus = "draft" | "committed" | "discarded";

export interface TimelineFollowUp {
  due_at: string;
  reason?: string | null;
  status?: "open" | "completed" | "cancelled" | null;
}

/**
 * A chart encounter plus the three things a timeline shows that
 * `/api/patients/[id]/history` does not return yet.
 *
 * All three are optional so `history.encounters` drops in untouched, and the
 * two empty values are kept distinct on purpose: `undefined` means this caller
 * has no such data at all and the row is omitted, `null` means nothing was
 * recorded for this visit and the row says so. Collapsing them would print
 * "Fee: not recorded" on every visit in a deployment that simply does not send
 * fees, which reads as a billing gap that is not there.
 */
export interface PatientTimelineEncounter extends PatientHistoryEncounter {
  status?: TimelineEncounterStatus | null;
  fee_amount?: number | null;
  follow_up?: TimelineFollowUp | null;
}

/** A stretch with no visits, measured back from this entry to the previous one. */
export interface TimelineGap {
  months: number;
  /** The older visit the gap runs back to. */
  fromIso: string;
  toIso: string;
}

export interface TimelineEntryProps {
  encounter: PatientTimelineEncounter;
  /**
   * Rendered under the card, not above it: the list runs newest first, so the
   * visit on the far side of the gap is the next one down the screen.
   */
  precedingGap?: TimelineGap | null;
  isFirstVisit?: boolean;
  /** Roving tabindex — the list keeps exactly one entry in the tab order. */
  tabIndex?: number;
  /** Epoch ms used to decide whether a follow-up is overdue; null before mount. */
  now?: number | null;
  registerNode?: (id: string, node: HTMLElement | null) => void;
}

const IST = "Asia/Kolkata";

const istIsoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Split from the weekday below because `en-IN` punctuates the combined pattern
 * as "Mon, 3 Aug, 2026" — a second comma that reads as a typo in a record a
 * doctor may screenshot. Joined by hand, the app's one locale gets the date it
 * uses everywhere else with the weekday in front of it.
 */
const dayMonthYear = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: IST,
});

const weekday = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: IST,
});

const monthAndYear = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: IST,
});

export interface IstDay {
  year: number;
  month: number;
  day: number;
}

/**
 * The clinic reads every date in IST, and the register is written from a phone
 * that may be on any clock. Deriving the calendar day through `Asia/Kolkata`
 * keeps a 1 a.m. visit inside the day the doctor saw it, which is what the
 * month grouping and the gap arithmetic below are counting.
 */
export function istDayOf(iso: string | null | undefined): IstDay | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = istIsoDay.format(date).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

export function sameIstDay(a: IstDay | null, b: IstDay | null): boolean {
  return a !== null && b !== null && a.year === b.year && a.month === b.month && a.day === b.day;
}

/** "2026-08" — the month bucket an encounter belongs to. */
export function istMonthKey(day: IstDay): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}`;
}

export function formatMonthLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : monthAndYear.format(date);
}

export function formatTimelineDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${weekday.format(date)}, ${dayMonthYear.format(date)}`;
}

/**
 * Whole months between two visits, counted the way a person counts them: 2 Jan
 * to 1 Mar is one month, not two. An average-days divisor gets that boundary
 * wrong in both directions depending on which months the gap crossed, and this
 * number is shown to a doctor as a statement about their patient.
 */
export function wholeMonthsBetween(
  olderIso: string | null | undefined,
  newerIso: string | null | undefined,
): number | null {
  const older = istDayOf(olderIso);
  const newer = istDayOf(newerIso);
  if (!older || !newer) return null;

  let months = (newer.year - older.year) * 12 + (newer.month - older.month);
  if (newer.day < older.day) months -= 1;
  return months < 0 ? null : months;
}

export function describeMonths(months: number): string {
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearText = years === 1 ? "1 year" : `${years} years`;
  if (rest === 0) return yearText;
  return `${yearText} ${rest === 1 ? "1 month" : `${rest} months`}`;
}

export function TimelineEntry({
  encounter,
  precedingGap = null,
  isFirstVisit = false,
  tabIndex = -1,
  now = null,
  registerNode,
}: TimelineEntryProps) {
  const baseId = useId();
  const headerId = `${baseId}-header`;
  const status = encounter.status ?? "committed";
  const dateText = formatTimelineDate(encounter.occurred_at);
  const timeText = dateText ? formatClock(encounter.occurred_at) : null;

  const setNode = useCallback(
    (node: HTMLElement | null) => {
      registerNode?.(encounter.id, node);
    },
    [registerNode, encounter.id],
  );

  const followUp = encounter.follow_up;
  const followUpDue = followUp ? formatTimelineDate(followUp.due_at) : null;
  const followUpOverdue =
    followUp != null &&
    (followUp.status ?? "open") === "open" &&
    now != null &&
    new Date(followUp.due_at).getTime() < now;

  return (
    <li className="relative pl-9">
      <span
        aria-hidden
        className={cn(
          "absolute top-[1.3rem] left-[0.6875rem] size-2.5 rounded-full",
          status === "draft"
            ? "bg-warning"
            : status === "discarded"
              ? "bg-muted-foreground"
              : "bg-primary",
          isFirstVisit && "top-[1.25rem] left-[0.625rem] size-3",
        )}
      />

      <article
        ref={setNode}
        data-timeline-entry={encounter.id}
        tabIndex={tabIndex}
        aria-labelledby={headerId}
        className={cn(
          "surface-card rounded-[1.35rem] p-4",
          // A draft is a machine transcript no doctor has confirmed. It carries
          // the same weight on screen as a signed visit unless it is drawn
          // differently, so the dashed edge and the warning dot are the point.
          status === "draft" && "border-dashed border-warning/50",
        )}
      >
        <header id={headerId} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {dateText ? (
            <time
              dateTime={encounter.occurred_at}
              className="text-sm font-semibold tracking-[-0.015em]"
            >
              {dateText}
            </time>
          ) : (
            <span className="text-sm font-semibold tracking-[-0.015em] text-muted-foreground">
              Date not recorded
            </span>
          )}

          {timeText && <span className="tnum text-xs text-muted-foreground">{timeText}</span>}

          {isFirstVisit ? (
            <Badge>First visit</Badge>
          ) : (
            encounter.visit_number != null && (
              <Badge variant="outline">Visit {encounter.visit_number}</Badge>
            )
          )}

          {status === "draft" && (
            <Badge variant="warning">
              Draft
              <span className="sr-only"> — not yet confirmed into the register</span>
            </Badge>
          )}
          {status === "discarded" && <Badge variant="secondary">Discarded</Badge>}
        </header>

        <dl className="mt-3 space-y-3">
          <Field icon={<StethoscopeIcon className="size-3.5" aria-hidden />} label="Diagnosis">
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {encounter.diagnosis?.trim() || "Not recorded"}
            </p>
          </Field>

          {encounter.treatment?.trim() && (
            <Field label="Treatment">
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                {encounter.treatment}
              </p>
            </Field>
          )}

          <Field icon={<PillIcon className="size-3.5" aria-hidden />} label="Medicines">
            {encounter.prescription.length > 0 ? (
              <ul className="space-y-1.5">
                {encounter.prescription.map((medicine) => {
                  const dose = [medicine.form, medicine.frequency, medicine.duration]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={medicine.id} className="surface-inset rounded-[0.85rem] px-3 py-2">
                      <p className="text-sm font-medium break-words">
                        {[medicine.drug_name, medicine.strength].filter(Boolean).join(" ")}
                      </p>
                      <p className="mt-0.5 text-xs break-words text-muted-foreground">
                        {dose || "Dose details not recorded"}
                      </p>
                      {medicine.instructions && (
                        <p className="mt-0.5 text-xs break-words">{medicine.instructions}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded</p>
            )}
          </Field>

          {encounter.fee_amount !== undefined && (
            <Field icon={<BanknoteIcon className="size-3.5" aria-hidden />} label="Fee">
              {typeof encounter.fee_amount === "number" && Number.isFinite(encounter.fee_amount) ? (
                <p className="tnum text-sm font-semibold text-money">
                  {formatINR(encounter.fee_amount)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Not recorded</p>
              )}
            </Field>
          )}

          {encounter.follow_up !== undefined && (
            <Field icon={<CalendarClockIcon className="size-3.5" aria-hidden />} label="Follow-up">
              {followUp && followUpDue ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm break-words">
                    Due {followUpDue}
                    {followUp.reason?.trim() ? ` — ${followUp.reason.trim()}` : ""}
                  </p>
                  {followUp.status === "completed" && <Badge variant="money">Done</Badge>}
                  {followUp.status === "cancelled" && <Badge variant="secondary">Cancelled</Badge>}
                  {followUpOverdue && <Badge variant="warning">Overdue</Badge>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None planned</p>
              )}
            </Field>
          )}
        </dl>

        <p className="mt-3 text-xs break-words text-muted-foreground">
          Recorded by {encounter.doctor_name?.trim() || "clinic doctor"}
          {encounter.age_years != null ? ` · Age at visit ${encounter.age_years}` : ""}
        </p>
      </article>

      {precedingGap && (
        <p className="relative mt-2.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {/* The rail sits at 1rem and this paragraph starts at the card's
              2.25rem inset, so a 0.375rem marker centres on the rail at
              1rem - 0.1875rem - 2.25rem. */}
          <span
            aria-hidden
            className="absolute top-1/2 -left-[1.4375rem] size-1.5 -translate-y-1/2 rounded-full bg-border"
          />
          <HistoryIcon className="size-3.5 shrink-0" aria-hidden />
          <span aria-hidden>{describeMonths(precedingGap.months)}, no visits</span>
          <span className="sr-only">
            Gap in care: {describeMonths(precedingGap.months)} with no visits between{" "}
            {formatTimelineDate(precedingGap.fromIso) ?? "an earlier visit"} and{" "}
            {formatTimelineDate(precedingGap.toIso) ?? "this visit"}.
          </span>
        </p>
      )}
    </li>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 min-w-0">{children}</dd>
    </div>
  );
}
