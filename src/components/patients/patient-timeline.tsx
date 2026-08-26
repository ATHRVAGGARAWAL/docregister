"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { CalendarClockIcon, ClipboardListIcon, HistoryIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  TimelineEntry,
  describeMonths,
  formatMonthLabel,
  istDayOf,
  istMonthKey,
  sameIstDay,
  wholeMonthsBetween,
  type PatientTimelineEncounter,
  type TimelineGap,
} from "./timeline-entry";

export type {
  PatientTimelineEncounter,
  TimelineEncounterStatus,
  TimelineFollowUp,
  TimelineGap,
} from "./timeline-entry";

/**
 * Under two months, a break in visits is the ordinary spacing between
 * appointments. Marking those too would put a banner between most pairs of
 * rows, and a marker that appears everywhere is one a doctor stops reading —
 * which costs the case it exists for: the patient who quietly stopped coming.
 */
const GAP_MONTHS = 2;

const DEFAULT_VISIBLE_VISITS = 20;

export interface PatientTimelineProps {
  /** Accepts `PatientHistoryPayload["encounters"]` as-is; order is not trusted. */
  encounters: readonly PatientTimelineEncounter[];
  /** `patients.first_seen_at`, used to confirm the oldest row really is visit one. */
  firstSeenAt?: string | null;
  /** Names the list for assistive technology. */
  patientName?: string | null;
  /** Fixes the clock, for tests and for callers that already have one. */
  now?: string | number | Date;
  /** Visits rendered before the first "show earlier" press, and the size of each press. */
  initialVisibleCount?: number;
  className?: string;
}

/** Everything the doctor has changed about *this* chart's presentation. */
interface TimelineView {
  chart: string;
  count: number;
  activeId: string | null;
  announcement: string;
}

interface TimelineMonthEntry {
  encounter: PatientTimelineEncounter;
  precedingGap: TimelineGap | null;
  isFirstVisit: boolean;
}

interface TimelineMonth {
  key: string;
  label: string;
  visits: number;
  /** Summed only over visits that carried a fee; null when none did. */
  fee: number | null;
  entries: TimelineMonthEntry[];
}

export function PatientTimeline({
  encounters,
  firstSeenAt = null,
  patientName = null,
  now,
  initialVisibleCount = DEFAULT_VISIBLE_VISITS,
  className,
}: PatientTimelineProps) {
  const baseId = useId();
  const hintId = `${baseId}-hint`;

  const nodes = useRef(new Map<string, HTMLElement>());
  const focusAfterReveal = useRef<string | null>(null);

  const ordered = useMemo(() => [...encounters].sort(byRecency), [encounters]);

  // Keyed on the chart's contents rather than the array identity: a caller that
  // rebuilds the prop on every render must not collapse the list under a doctor
  // who has just expanded it.
  const chartKey = `${ordered.length}:${ordered[0]?.id ?? ""}`;
  const [view, setView] = useState<TimelineView>(() => freshView(chartKey, initialVisibleCount));

  // Another patient's chart must not inherit this one's expansion, focused row
  // or last announcement. Derived rather than reset in an effect, so the stale
  // values never reach the screen at all.
  const current = view.chart === chartKey ? view : freshView(chartKey, initialVisibleCount);
  const visibleCount = current.count;

  // The elapsed-time note needs a clock the server does not have. Rendering it
  // during SSR and again in the browser can disagree across a month boundary,
  // and a clinical statement that rewrites itself after paint is worse than one
  // that arrives a frame late.
  const [mountClock] = useState(readClock);
  const hydrated = useSyncExternalStore(subscribeToNothing, onClient, onServer);
  const clockNow = now === undefined ? (hydrated ? mountClock : null) : resolveNow(now);

  /**
   * The oldest row on screen is not necessarily the patient's first visit —
   * this chart can be a window onto a longer record. The badge is a claim about
   * a medical record, so it needs the encounter to say so itself, or the
   * patient's own first-seen date to land on the same day.
   */
  const firstVisitId = useMemo(() => {
    const numbered = ordered.find((encounter) => encounter.visit_number === 1);
    if (numbered) return numbered.id;

    const dated = ordered.filter((encounter) => istDayOf(encounter.occurred_at) !== null);
    const oldest = dated[dated.length - 1];
    if (!oldest || !firstSeenAt) return null;

    return sameIstDay(istDayOf(oldest.occurred_at), istDayOf(firstSeenAt)) ? oldest.id : null;
  }, [ordered, firstSeenAt]);

  const groups = useMemo<TimelineMonth[]>(() => {
    const buckets: TimelineMonth[] = [];

    ordered.slice(0, visibleCount).forEach((encounter, index) => {
      const day = istDayOf(encounter.occurred_at);
      const key = day ? istMonthKey(day) : "undated";

      let bucket = buckets[buckets.length - 1];
      if (!bucket || bucket.key !== key) {
        bucket = {
          key,
          label: day ? formatMonthLabel(encounter.occurred_at) : "Date not recorded",
          visits: 0,
          fee: null,
          entries: [],
        };
        buckets.push(bucket);
      }

      // Gaps are measured against the whole chart, not the visible slice, so
      // revealing older visits never changes what an already-shown row claims.
      const older = ordered[index + 1];
      const gapMonths = older
        ? wholeMonthsBetween(older.occurred_at, encounter.occurred_at)
        : null;

      bucket.entries.push({
        encounter,
        precedingGap:
          older && gapMonths != null && gapMonths >= GAP_MONTHS
            ? { months: gapMonths, fromIso: older.occurred_at, toIso: encounter.occurred_at }
            : null,
        isFirstVisit: encounter.id === firstVisitId,
      });
      bucket.visits += 1;

      const fee = encounter.fee_amount;
      if (typeof fee === "number" && Number.isFinite(fee)) bucket.fee = (bucket.fee ?? 0) + fee;
    });

    return buckets;
  }, [ordered, visibleCount, firstVisitId]);

  const visibleIds = useMemo(
    () => groups.flatMap((group) => group.entries.map((entry) => entry.encounter.id)),
    [groups],
  );

  const registerNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  // Revealing older visits removes nothing from the tab order, but it does put
  // new content above the button that was just pressed. Landing on the first
  // revealed visit is where a keyboard user was heading anyway.
  useEffect(() => {
    const id = focusAfterReveal.current;
    if (!id) return;
    focusAfterReveal.current = null;
    nodes.current.get(id)?.focus();
  }, [visibleCount]);

  const sinceLastVisit = useMemo(() => {
    if (clockNow == null) return null;

    const latest = ordered.find(
      (encounter) =>
        (encounter.status ?? "committed") !== "discarded" &&
        istDayOf(encounter.occurred_at) !== null,
    );
    if (!latest) return null;

    const months = wholeMonthsBetween(latest.occurred_at, new Date(clockNow).toISOString());
    return months != null && months >= GAP_MONTHS ? months : null;
  }, [ordered, clockNow]);

  const shown = Math.min(visibleCount, ordered.length);
  const hidden = ordered.length - shown;
  const nextReveal = Math.min(initialVisibleCount, hidden);
  const activeEntryId =
    current.activeId && visibleIds.includes(current.activeId)
      ? current.activeId
      : (visibleIds[0] ?? null);

  function moveFocus(currentId: string, key: string): boolean {
    const index = visibleIds.indexOf(currentId);
    if (index < 0) return false;

    let target: number;
    switch (key) {
      case "ArrowDown":
        target = index + 1;
        break;
      case "ArrowUp":
        target = index - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = visibleIds.length - 1;
        break;
      default:
        return false;
    }

    const nextId = visibleIds[Math.max(0, Math.min(target, visibleIds.length - 1))];
    if (nextId && nextId !== currentId) {
      setView({ ...current, activeId: nextId });
      nodes.current.get(nextId)?.focus();
    }
    return true;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLOListElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const currentId = target.dataset.timelineEntry;
    if (!currentId) return;
    if (moveFocus(currentId, event.key)) event.preventDefault();
  }

  function handleFocus(event: ReactFocusEvent<HTMLOListElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const focusedId = target.dataset.timelineEntry;
    if (focusedId && focusedId !== current.activeId) {
      setView({ ...current, activeId: focusedId });
    }
  }

  function showEarlier() {
    const nextCount = Math.min(visibleCount + initialVisibleCount, ordered.length);
    const revealedId = ordered[shown]?.id ?? null;
    focusAfterReveal.current = revealedId;

    setView({
      chart: chartKey,
      count: nextCount,
      activeId: revealedId ?? current.activeId,
      announcement: `Showing ${nextCount} of ${ordered.length} visits.`,
    });
  }

  if (ordered.length === 0) {
    return (
      <div
        className={cn(
          "surface-card grid min-h-44 place-items-center rounded-[1.35rem] p-6 text-center",
          className,
        )}
      >
        <div>
          <ClipboardListIcon className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">No visits on this chart yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The patient record exists; nothing has been written against it in the register.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <p className="sr-only" role="status" aria-live="polite">
        {current.announcement}
      </p>
      <span id={hintId} className="sr-only">
        Visits run newest first. Use the up and down arrow keys to move between visits.
      </span>

      {sinceLastVisit != null && (
        <p className="surface-inset mb-4 flex items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-xs font-medium">
          <CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            {describeMonths(sinceLastVisit)} since the last visit
          </span>
        </p>
      )}

      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-2 bottom-2 left-4 w-px bg-border"
        />

        <ol
          aria-label={patientName ? `Visits for ${patientName}, by month` : "Visits by month"}
          aria-describedby={hintId}
          className="space-y-6"
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
        >
          {groups.map((group) => {
            const headingId = `${baseId}-${group.key}`;
            return (
              <li key={group.key}>
                <h3
                  id={headingId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pl-9 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase"
                >
                  <span>{group.label}</span>
                  {/* `justify-between` puts these at opposite ends with no text
                      between them, so the heading's accessible name concatenated
                      to "October 20252 visits" and was read as one number. */}
                  <span className="sr-only">, </span>
                  <span className="tnum tracking-normal normal-case">
                    {group.visits === 1 ? "1 visit" : `${group.visits} visits`}
                    {group.fee != null ? ` · ${formatINR(group.fee)}` : ""}
                  </span>
                </h3>

                <ol aria-labelledby={headingId} className="mt-3 space-y-3">
                  {group.entries.map((entry) => (
                    <TimelineEntry
                      key={entry.encounter.id}
                      encounter={entry.encounter}
                      precedingGap={entry.precedingGap}
                      isFirstVisit={entry.isFirstVisit}
                      tabIndex={entry.encounter.id === activeEntryId ? 0 : -1}
                      now={clockNow}
                      registerNode={registerNode}
                    />
                  ))}
                </ol>
              </li>
            );
          })}
        </ol>
      </div>

      {hidden > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 pl-9">
          <Button type="button" variant="outline" size="sm" onClick={showEarlier}>
            <HistoryIcon aria-hidden />
            {nextReveal === 1 ? "Show 1 earlier visit" : `Show ${nextReveal} earlier visits`}
          </Button>
          <p className="tnum text-xs text-muted-foreground">
            {shown} of {ordered.length} visits shown
          </p>
        </div>
      )}
    </div>
  );
}

function freshView(chart: string, count: number): TimelineView {
  return { chart, count, activeId: null, announcement: "" };
}

function readClock(): number {
  return Date.now();
}

function subscribeToNothing(): () => void {
  return noop;
}

function noop(): void {}

function onClient(): boolean {
  return true;
}

function onServer(): boolean {
  return false;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
}

/** Newest first, with anything undated last rather than dropped. */
function byRecency(a: PatientTimelineEncounter, b: PatientTimelineEncounter): number {
  const left = timeOf(a.occurred_at);
  const right = timeOf(b.occurred_at);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left !== right) return right - left;
  return (b.visit_number ?? 0) - (a.visit_number ?? 0);
}

function resolveNow(now: PatientTimelineProps["now"]): number | null {
  if (now === undefined) return null;
  const value = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isNaN(value) ? null : value;
}
