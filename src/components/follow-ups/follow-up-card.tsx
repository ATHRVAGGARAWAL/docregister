"use client";

import { type ComponentType, useId } from "react";

import type { FollowUpItem } from "@/components/follow-ups/follow-up-workspace";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  type IconProps,
  PhoneIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatVisitDay, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A follow-up is due on a *day*, not at an instant. The workspace stores every
 * one at 12:00 IST, so comparing `due_at` to `Date.now()` — which is what the
 * queue does — flips a follow-up to "overdue" at lunchtime on the day it is
 * due. Everything here buckets by the clinic's calendar day instead.
 */
const istDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `value` as a "YYYY-MM-DD" calendar day in the clinic's timezone. */
export function istDay(value: Date): string {
  return istDayFormat.format(value);
}

/** Days since the epoch, so two IST calendar days can be subtracted. */
function dayIndex(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

export type DueUrgency = "overdue" | "today";

export interface DueFollowUp {
  item: FollowUpItem;
  urgency: DueUrgency;
  /** Whole IST days between the due day and today. 0 when due today. */
  daysOverdue: number;
}

/**
 * Places an open follow-up against today, or returns `null` when it does not
 * belong in front of the doctor yet — a future return date, or a `due_at` that
 * cannot be read as a date at all.
 *
 * `today` is an `istDay()` result, taken once per pass so a long list cannot
 * straddle a midnight.
 */
export function classifyDue(item: FollowUpItem, today: string): DueFollowUp | null {
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) return null;

  const daysOverdue = dayIndex(today) - dayIndex(istDay(due));
  if (daysOverdue < 0) return null;

  return { item, urgency: daysOverdue === 0 ? "today" : "overdue", daysOverdue };
}

const URGENCY_STYLE: Record<
  DueUrgency,
  { rail: string; mark: string; badge: "destructive" | "default"; icon: ComponentType<IconProps> }
> = {
  overdue: {
    rail: "w-1 bg-destructive",
    mark: "border-destructive/25 bg-destructive-soft text-destructive",
    badge: "destructive",
    icon: TriangleAlertIcon,
  },
  today: {
    rail: "w-0.5 bg-primary",
    mark: "border-primary/20 bg-primary-soft text-primary",
    badge: "default",
    icon: CalendarClockIcon,
  },
};

export interface FollowUpCardProps {
  entry: DueFollowUp;
  /** Hands the chart to whoever owns the patient history sheet. */
  onOpenChart: (patient: PatientMatch) => void;
  className?: string;
}

/**
 * One due follow-up, as a single tap target.
 *
 * The whole card opens the chart rather than a small link inside it: this is
 * read on a phone between patients, and the action a doctor wants from a recall
 * list is always "show me this person". Only the chart the follow-up already
 * names can be opened, so nothing here can put the wrong patient on screen.
 */
export function FollowUpCard({ entry, onOpenChart, className }: FollowUpCardProps) {
  const { item, urgency } = entry;
  const statusId = useId();
  const reasonId = useId();

  const name = item.patient_name ?? "Patient";
  const phone = maskPhone(item.patient_phone);
  const dueDay = formatVisitDay(item.due_at);
  const style = URGENCY_STYLE[urgency];
  const UrgencyIcon = style.icon;

  return (
    <article
      className={cn(
        "surface-card pressable group relative isolate overflow-hidden rounded-xl p-3 hover:border-primary/25 sm:p-3.5",
        className,
      )}
    >
      <span
        className={cn("pointer-events-none absolute inset-y-3 left-0 rounded-full", style.rail)}
        aria-hidden
      />

      {/* The label names the action; the description is the card's own status
          and reason text, so the two can never drift apart. */}
      <button
        type="button"
        aria-label={`Open ${name}’s chart`}
        aria-describedby={`${statusId} ${reasonId}`}
        onClick={() =>
          onOpenChart({
            id: item.patient_id,
            full_name: name,
            phone: item.patient_phone ?? null,
            // The history sheet re-fetches the chart from `patient_id`; the
            // follow-up row carries no age or visit history to pass on.
            age_years: null,
            last_visit: null,
            visit_count: null,
          })
        }
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10 flex items-start gap-3 pl-1.5">
        <span
          className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border", style.mark)}
        >
          <UserRoundIcon className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">{name}</p>
            <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors group-hover:text-primary sm:flex">
              Open <ArrowUpRightIcon className="size-3.5" aria-hidden />
            </span>
          </div>

          <p id={reasonId} className="mt-1 text-sm leading-5 text-foreground">
            {item.reason}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <Badge id={statusId} variant={style.badge} className="gap-1.5">
              <UrgencyIcon aria-hidden />
              {urgency === "overdue" ? (
                <>
                  <span className="tnum">{entry.daysOverdue}</span>
                  {entry.daysOverdue === 1 ? " day overdue" : " days overdue"}
                </>
              ) : (
                "Due today"
              )}
            </Badge>
            {dueDay ? (
              <time dateTime={item.due_at} className="tnum">
                Due {dueDay}
              </time>
            ) : null}
            {phone ? (
              <span className="flex items-center gap-1.5">
                <PhoneIcon className="size-3.5" aria-hidden />
                <span className="tnum">{phone}</span>
              </span>
            ) : null}
          </div>

          {item.notes ? (
            <p className="mt-2 line-clamp-2 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
              {item.notes}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
