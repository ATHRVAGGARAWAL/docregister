"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  type DueFollowUp,
  FollowUpCard,
  classifyDue,
  istDay,
} from "@/components/follow-ups/follow-up-card";
import type { FollowUpItem } from "@/components/follow-ups/follow-up-workspace";
import {
  ChevronRightIcon,
  ClipboardClockIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";

/**
 * How old a check has to be before returning to the tab re-runs it.
 *
 * A clinic tablet sits on this screen all morning. Without this the banner
 * would keep asserting a count taken hours ago — including across midnight,
 * when "due today" means a different day.
 */
const STALE_AFTER_MS = 5 * 60_000;

/** The API caps `limit` at 200, and returns open follow-ups due-soonest first. */
const FETCH_LIMIT = 200;

type LoadState = "loading" | "ready" | "error";

export interface DueBannerProps {
  /** Opens the patient's chart. Wire to whatever owns the patient history sheet. */
  onOpenChart: (patient: PatientMatch) => void;
  /**
   * Re-checks the queue when it changes. Pass a value that moves whenever a
   * follow-up is scheduled or completed, so the banner cannot keep offering
   * work the doctor has just finished.
   */
  refreshKey?: number | string;
  /** Match the surrounding document outline. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * The follow-ups that are actually due, in front of the doctor.
 *
 * The queue in `FollowUpWorkspace` is a place you go; this is a thing that
 * finds you. It renders nothing at all when nothing is due — an empty panel
 * saying "no follow-ups today" would cost a line of the fold every day to say
 * nothing — and stays collapsed to a single summary line until asked to open.
 *
 * Overdue and due-today are never told apart by colour alone: they carry
 * different icons, different words, and their own headings once both are on
 * screen.
 */
export function DueBanner({
  onOpenChart,
  refreshKey,
  headingLevel = 2,
  className,
}: DueBannerProps) {
  const [entries, setEntries] = useState<DueFollowUp[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const reduceMotion = useReducedMotion();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const checkedAtRef = useRef(0);
  const headingId = useId();
  const panelId = useId();
  const overdueHeadingId = useId();
  const todayHeadingId = useId();

  const load = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/follow-ups?status=open&limit=${FETCH_LIMIT}`, {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as { followUps?: FollowUpItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load follow-ups.");

      // One `today` for the whole pass: taken per item, a long list crossing
      // midnight would bucket its first and last rows against different days.
      const today = istDay(new Date());
      setEntries(
        (payload.followUps ?? [])
          .map((item) => classifyDue(item, today))
          .filter((entry): entry is DueFollowUp => entry !== null)
          .sort(byMostOverdue),
      );
      setState("ready");
      checkedAtRef.current = Date.now();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setState("error");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Deferred by a tick because `load` sets state on its first line, and a
    // synchronous setState inside an effect cascades an extra render.
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, refreshKey]);

  useEffect(() => {
    function recheck() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - checkedAtRef.current < STALE_AFTER_MS) return;
      void load();
    }

    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, [load]);

  const overdue = useMemo(() => entries.filter((entry) => entry.urgency === "overdue"), [entries]);
  const dueToday = useMemo(() => entries.filter((entry) => entry.urgency === "today"), [entries]);
  const mixed = overdue.length > 0 && dueToday.length > 0;
  const headline = summarise(overdue.length, dueToday.length);

  function collapse() {
    // Focus first: the panel unmounts on the way out, and focus sitting on a
    // removed node drops a keyboard user back at the top of the document.
    toggleRef.current?.focus();
    setExpanded(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !expanded) return;
    event.stopPropagation();
    collapse();
  }

  const Heading = `h${headingLevel}` as "h2" | "h3";
  const GroupHeading = `h${headingLevel + 1}` as "h3" | "h4";

  return (
    <>
      {/* Mounted whether or not anything is due. A live region inserted into the
          page at the same moment as its text is announced by very few screen
          readers, and "3 patients are overdue" is the sentence that most needs
          to arrive. */}
      <p className="sr-only" role="status" aria-live="polite">
        {spokenSummary(state, overdue.length, dueToday.length)}
      </p>

      {/* A refresh failure must not take the list down with it. `load()` sets
          `state = "error"` without clearing `entries`, and the visibilitychange
          recheck re-runs it whenever the doctor returns to the tab — so testing
          `error` before `ready` replaced a still-valid list of overdue patients
          with a one-line apology. The names are the point of this banner: a
          failed recheck is a reason to say the list may be stale, not to take it
          away. Only a failure with nothing already loaded gets the full-width
          treatment. */}
      {state === "error" && entries.length === 0 ? (
        <section
          className={cn(
            "surface-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5",
            className,
          )}
        >
          <p className="text-sm leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">
              Couldn’t check today’s follow-ups.
            </span>{" "}
            Everything already scheduled is still scheduled — this is a problem reaching the list.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
            Try again
          </Button>
        </section>
      ) : entries.length > 0 ? (
        <section
          aria-labelledby={headingId}
          onKeyDown={handleKeyDown}
          className={cn("surface-card overflow-hidden rounded-2xl", className)}
        >
          <Heading id={headingId} className="text-sm font-semibold">
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((open) => !open)}
              className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [@media(pointer:coarse)]:min-h-14"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl border",
                  overdue.length > 0
                    ? "border-destructive/25 bg-destructive-soft text-destructive"
                    : "border-primary/20 bg-primary-soft text-primary",
                )}
              >
                {overdue.length > 0 ? (
                  <TriangleAlertIcon className="size-4" aria-hidden />
                ) : (
                  <ClipboardClockIcon className="size-4" aria-hidden />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block tracking-[-0.01em]">{headline}</span>
                {mixed ? (
                  <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                    <span className="tnum">{overdue.length}</span> overdue
                    <span aria-hidden> · </span>
                    <span className="tnum">{dueToday.length}</span> due today
                  </span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
                <span className="hidden sm:inline">{expanded ? "Hide" : "Review"}</span>
                <ChevronRightIcon
                  className={cn("size-4 transition-transform", expanded && "rotate-90")}
                  aria-hidden
                />
              </span>
            </button>
          </Heading>

          {/* The wrapper is always in the DOM so `aria-controls` always resolves,
              even while the panel itself is animating out. */}
          <div id={panelId}>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  key="panel"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 border-t border-border p-3 sm:p-3.5">
                    {overdue.length > 0 ? (
                      <section aria-labelledby={mixed ? overdueHeadingId : undefined}>
                        {/* Only worth a heading when there is a second group to
                            tell it apart from — otherwise it repeats the summary
                            line directly above it. */}
                        {mixed ? (
                          <GroupHeading
                            id={overdueHeadingId}
                            className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                          >
                            Overdue <span className="tnum">({overdue.length})</span>
                          </GroupHeading>
                        ) : null}
                        <ul className="space-y-2">
                          {overdue.map((entry) => (
                            <li key={entry.item.id}>
                              <FollowUpCard entry={entry} onOpenChart={onOpenChart} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {dueToday.length > 0 ? (
                      <section aria-labelledby={mixed ? todayHeadingId : undefined}>
                        {mixed ? (
                          <GroupHeading
                            id={todayHeadingId}
                            className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                          >
                            Due today <span className="tnum">({dueToday.length})</span>
                          </GroupHeading>
                        ) : null}
                        <ul className="space-y-2">
                          {dueToday.map((entry) => (
                            <li key={entry.item.id}>
                              <FollowUpCard entry={entry} onOpenChart={onOpenChart} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Most overdue first; same wait, alphabetical, so the order never reshuffles. */
function byMostOverdue(a: DueFollowUp, b: DueFollowUp): number {
  if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
  return (a.item.patient_name ?? "").localeCompare(b.item.patient_name ?? "", "en-IN");
}

/**
 * The one line the doctor reads at a glance.
 *
 * Three shapes rather than one, because a patient who was due last Tuesday is
 * not "due today" and a banner that says so is telling the doctor something
 * untrue about their own register.
 */
function summarise(overdueCount: number, todayCount: number): string {
  if (overdueCount === 0) {
    return todayCount === 1
      ? "1 patient is due for follow-up today"
      : `${todayCount} patients are due for follow-up today`;
  }
  if (todayCount === 0) {
    return overdueCount === 1
      ? "1 patient is overdue for follow-up"
      : `${overdueCount} patients are overdue for follow-up`;
  }
  return `${overdueCount + todayCount} patients need a follow-up today`;
}

function spokenSummary(state: LoadState, overdueCount: number, todayCount: number): string {
  if (state === "error") return "Couldn’t check today’s follow-ups.";
  if (state !== "ready" || overdueCount + todayCount === 0) return "";
  if (overdueCount > 0 && todayCount > 0) {
    return `${summarise(overdueCount, todayCount)}: ${overdueCount} overdue, ${todayCount} due today.`;
  }
  return `${summarise(overdueCount, todayCount)}.`;
}
