"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CheckIcon,
  CircleAlertIcon,
  HistoryIcon,
  LoaderCircleIcon,
  Trash2,
  TriangleAlertIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  useEscapeDismiss,
  useSelection,
  type SelectionControls,
} from "@/hooks/use-selection";
import { formatClock, formatDayLong } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Bulk actions for the register.
 *
 * Two decisions worth stating, because both were choices between defensible
 * options.
 *
 * **Confirmation and undo, not one or the other.** Discarding a draft is soft —
 * the row keeps its transcript, its edits and its place, and `POST
 * /api/drafts/:id` puts it back — so undo is genuinely available here and is the
 * thing that protects the data. It is also what a doctor reaches for after the
 * mistake, which is the only moment that matters. But a bulk action still needs
 * more friction than the single discard it replaces, and a modal dialog is the
 * wrong kind: it moves focus off the register, it is the control people learn to
 * dismiss without reading, and on a phone it covers the very rows whose count it
 * is asking about. So the friction is an arm step inside the bar itself — the
 * count is named on both presses, the confirm button is a second, separate
 * target, and Escape backs out — and undo is what stands behind it.
 *
 * **The undo offer has no timer.** A doctor is interrupted mid-consultation,
 * and a remedy that expires while they are looking at a patient is not a remedy.
 * Timed dismissal is also a WCAG 2.2.1 failure with no exception that fits. The
 * offer stays until it is dismissed, replaced by another action, or the register
 * is left.
 *
 * Committed visits are unreachable from here by construction rather than by
 * check: `useRegisterSelection` only ever hands draft ids to the selection, so a
 * committed visit has no id in the list a range can span or a "select all" can
 * reach.
 */

/** Concurrent requests per bulk action. Enough to feel immediate, few enough not to burst. */
const REQUEST_LIMIT = 4;

/**
 * A polite region that re-announces on every keystroke of a shift-range is
 * noise. Publishing only text that has been still this long collapses a
 * twenty-row sweep into the one count that ended it.
 */
const ANNOUNCE_SETTLE_MS = 400;

/**
 * The selection for a page of the register.
 *
 * Only drafts are eligible. A committed visit is a clinical record and a
 * discarded one has already been discarded, so neither can be selected, ranged
 * over, or caught by "select all".
 */
export function useRegisterSelection(entries: readonly RegisterEntry[]): SelectionControls {
  const draftIds = useMemo(
    () => entries.filter((entry) => entry.status === "draft").map((entry) => entry.id),
    [entries],
  );

  return useSelection(draftIds);
}

/**
 * The per-row select control. Renders nothing for a row that cannot be
 * selected, so the register can place it on every row without asking why.
 */
export function RegisterSelectToggle({
  entry,
  selection,
  className,
}: {
  entry: RegisterEntry;
  selection: SelectionControls;
  className?: string;
}) {
  const props = selection.itemProps(entry.id);
  const selected = props["aria-checked"];

  if (entry.status !== "draft") return null;

  return (
    <button
      type="button"
      {...props}
      // The visit's own words, so a screen reader hears which draft this ticks
      // rather than "checkbox" nine times down a page.
      aria-label={`Select ${entry.patient_name}'s draft from ${formatDayLong(
        entry.occurred_at.slice(0, 10),
      )} at ${formatClock(entry.occurred_at)}`}
      className={cn(
        "pressable pointer-events-auto relative z-20 grid size-9 shrink-0 touch-manipulation place-items-center rounded-lg border focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:size-11",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-field-border bg-background text-transparent hover:border-primary hover:text-primary/40",
        className,
      )}
    >
      <CheckIcon className="size-4" aria-hidden />
    </button>
  );
}

export interface RegisterBulkBarProps {
  selection: SelectionControls;
  /** The rows currently on screen. */
  entries: readonly RegisterEntry[];
  /** Fires after drafts are discarded or restored, so the caller can reload the register. */
  onChanged?: () => void;
  /**
   * Drafts matching the current filters across every page. When it exceeds what
   * is on screen the bar says so, rather than letting "select all" imply a
   * reach it does not have.
   */
  totalDraftCount?: number;
  className?: string;
}

type BulkTask = { kind: "discarding" | "restoring"; total: number };

export function RegisterBulkBar({
  selection,
  entries,
  onChanged,
  totalDraftCount,
  className,
}: RegisterBulkBarProps) {
  const reduceMotion = useReducedMotion();
  const { count, eligibleCount, allSelected, partiallySelected } = selection;

  // The confirm is pinned to the exact set the count was read from, rather than
  // held as a boolean: a selection that changed under an armed confirm — a row
  // ticked, a background reload dropping a row — is no longer the selection the
  // doctor agreed to, and this way it disarms itself without an effect racing
  // the render that changed it.
  const signature = useMemo(() => selection.selectedIds.join(" "), [selection.selectedIds]);
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const armed = armedFor !== null && armedFor === signature;

  const [task, setTask] = useState<BulkTask | null>(null);
  const [undoable, setUndoable] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const discardRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  // Re-derived from the rows on screen rather than trusted from the selection:
  // this component cannot know that whoever built the selection scoped it to
  // drafts, and a committed visit is a clinical record.
  const discardableIds = useMemo(() => {
    const drafts = new Set(
      entries.filter((entry) => entry.status === "draft").map((entry) => entry.id),
    );
    return selection.selectedIds.filter((id) => drafts.has(id));
  }, [entries, selection.selectedIds]);

  const disarm = useCallback(() => {
    setArmedFor(null);
    discardRef.current?.focus();
  }, []);

  const clearSelection = useCallback(() => {
    selection.clear();
    // The bar is about to lose its controls, and focus with them. Back to the
    // row the doctor last ticked, which is where their attention already is.
    selection.focusLastItem();
  }, [selection]);

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  useEscapeDismiss(armed, disarm);
  useEscapeDismiss(!armed && task === null && count > 0, clearSelection);

  const runDiscard = useCallback(async () => {
    const ids = discardableIds;
    setArmedFor(null);
    if (ids.length === 0) return;

    setProblem(null);
    setTask({ kind: "discarding", total: ids.length });

    const results = await mapWithLimit(ids, (id) => setDraftDiscarded(id, true));
    const discarded = ids.filter((_, index) => results[index]);
    const failed = ids.length - discarded.length;

    setTask(null);
    selection.clear();
    setUndoable(discarded);
    setProblem(discardProblem(discarded.length, failed));
    onChanged?.();
  }, [discardableIds, onChanged, selection]);

  const runUndo = useCallback(async () => {
    const ids = undoable;
    if (ids.length === 0) return;

    setProblem(null);
    setTask({ kind: "restoring", total: ids.length });

    const results = await mapWithLimit(ids, (id) => setDraftDiscarded(id, false));
    const restored = results.filter(Boolean).length;

    setTask(null);
    setUndoable([]);
    setProblem(restoreProblem(restored, ids.length - restored));
    onChanged?.();
  }, [onChanged, undoable]);

  const dismissOutcome = useCallback(() => {
    setUndoable([]);
    setProblem(null);
    selection.focusLastItem();
  }, [selection]);

  // Focus has to leave the confirm button when it unmounts, and the remedy for
  // what just happened is the best place for it to land.
  const undoCount = undoable.length;
  useEffect(() => {
    if (undoCount > 0) undoRef.current?.focus();
  }, [undoCount]);

  const announcement = useSettledAnnouncement(
    task?.kind === "discarding"
      ? `Discarding ${task.total} ${draftWord(task.total)}.`
      : task?.kind === "restoring"
        ? `Restoring ${task.total} ${draftWord(task.total)}.`
        : armed
          ? `Confirm to discard ${count} ${draftWord(count)}. Escape cancels.`
          : count > 0
            ? `${count} of ${eligibleCount} ${draftWord(eligibleCount)} selected.`
            : undoCount > 0
              ? `${undoCount} ${draftWord(undoCount)} discarded. Undo is available.`
              : "",
  );

  const busy = task !== null;
  const visible = count > 0 || busy || undoCount > 0 || problem !== null;
  const pageIsPartial = totalDraftCount !== undefined && totalDraftCount > eligibleCount;

  return (
    <>
      {/* Mounted whether or not the bar is, so the count of the first row ticked
          is announced rather than lost to the region arriving with it. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <AnimatePresence>
        {visible && (
          <motion.div
            key="register-bulk-bar"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              // Clears the voice dock by its measured height plus the home
              // indicator the dock's own padding sits on, so the bar never lands
              // on top of the stop button mid-dictation.
              "pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-height,7rem)+max(0.75rem,env(safe-area-inset-bottom))+0.5rem)] z-30 flex justify-center px-2 sm:px-5 lg:left-64",
              className,
            )}
          >
            <div
              aria-busy={busy}
              aria-label="Register bulk actions"
              role="group"
              className="surface-dock pointer-events-auto w-full max-w-[42rem] overflow-hidden rounded-xl"
            >
              {(undoCount > 0 || problem !== null) && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2 sm:px-2.5">
                  {problem !== null ? (
                    <p
                      role="alert"
                      className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-5 text-destructive"
                    >
                      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {problem}
                    </p>
                  ) : (
                    <p className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <HistoryIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>
                        <span className="tnum font-semibold text-foreground">{undoCount}</span>{" "}
                        {draftWord(undoCount)} discarded. Each one keeps its transcript and details.
                      </span>
                    </p>
                  )}

                  <div className="flex shrink-0 items-center gap-1.5">
                    {undoCount > 0 && (
                      <Button
                        ref={undoRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runUndo()}
                      >
                        {task?.kind === "restoring" ? (
                          <LoaderCircleIcon className="animate-spin" aria-hidden />
                        ) : (
                          <HistoryIcon aria-hidden />
                        )}
                        Undo
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        undoCount > 0
                          ? `Dismiss — keep ${undoCount} ${draftWord(undoCount)} discarded`
                          : "Dismiss this message"
                      }
                      onClick={dismissOutcome}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                </div>
              )}

              {armed ? (
                <div className="flex flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-2.5">
                  <p className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-5 text-foreground">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <span>
                      Discard <span className="tnum font-semibold">{count}</span>{" "}
                      {draftWord(count)}? Each one keeps its transcript and can be restored.
                    </span>
                  </p>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={disarm}
                    >
                      Cancel
                    </Button>
                    <Button
                      ref={confirmRef}
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => void runDiscard()}
                    >
                      Discard {count}
                    </Button>
                  </div>
                </div>
              ) : count > 0 || busy ? (
                <div className="flex flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={allSelected ? true : partiallySelected ? "mixed" : false}
                    aria-label={`Select all ${eligibleCount} ${draftWord(eligibleCount)} on this page`}
                    disabled={busy || eligibleCount === 0}
                    onClick={allSelected ? clearSelection : selection.selectAll}
                    className={cn(
                      "pressable grid size-9 shrink-0 touch-manipulation place-items-center rounded-lg border focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [@media(pointer:coarse)]:size-11",
                      count > 0
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-field-border bg-background text-transparent hover:border-primary",
                    )}
                  >
                    {allSelected ? (
                      <CheckIcon className="size-4" aria-hidden />
                    ) : (
                      <span className="h-0.5 w-3 rounded-full bg-current" aria-hidden />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                      <span className="tnum">{busy ? (task?.total ?? 0) : count}</span> of{" "}
                      <span className="tnum">{eligibleCount}</span> {draftWord(eligibleCount)}{" "}
                      {busy
                        ? task?.kind === "restoring"
                          ? "being restored"
                          : "being discarded"
                        : "selected"}
                    </p>
                    {pageIsPartial && (
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        <span className="tnum">{totalDraftCount}</span> drafts match these filters;
                        this page holds <span className="tnum">{eligibleCount}</span>.
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={clearSelection}
                  >
                    <XIcon aria-hidden />
                    Clear
                  </Button>

                  <Button
                    ref={discardRef}
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy || discardableIds.length === 0}
                    onClick={() => setArmedFor(signature)}
                    className="w-full sm:w-auto"
                  >
                    {task?.kind === "discarding" ? (
                      <LoaderCircleIcon className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    Discard {count} {draftWord(count)}
                  </Button>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Holds a message back until it has stopped changing, so a burst of toggles
 * produces one announcement instead of one per row.
 */
function useSettledAnnouncement(message: string): string {
  const [settled, setSettled] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(message), ANNOUNCE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return settled;
}

/**
 * Runs `action` over `ids` a few at a time, in order, and never rejects: a
 * bulk action reports how far it got, and one draft that will not move is not a
 * reason to abandon the rest.
 */
async function mapWithLimit(
  ids: readonly string[],
  action: (id: string) => Promise<boolean>,
): Promise<boolean[]> {
  const results: boolean[] = new Array(ids.length).fill(false);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await action(ids[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(REQUEST_LIMIT, ids.length) }, () => worker()),
  );
  return results;
}

/** Both directions are idempotent server-side, so a repeat of either is harmless. */
async function setDraftDiscarded(id: string, discarded: boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: discarded ? "DELETE" : "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function draftWord(count: number): string {
  return count === 1 ? "draft" : "drafts";
}

/**
 * Counts, not causes. Each row failed for its own reason and the server's
 * wording for any one of them would be wrong for the others, so the message
 * says what stands and what to do about it.
 */
function discardProblem(discarded: number, failed: number): string | null {
  if (failed === 0) return null;
  if (discarded === 0) {
    return `Could not discard ${failed} ${draftWord(failed)}. ${
      failed === 1 ? "It" : "They"
    } may have been saved or changed in another window — reload the register and try again.`;
  }
  return `${discarded} of ${discarded + failed} drafts were discarded. The other ${failed} could not be — reload the register to see where ${
    failed === 1 ? "it stands" : "they stand"
  }.`;
}

function restoreProblem(restored: number, failed: number): string | null {
  if (failed === 0) return null;
  if (restored === 0) {
    return `Could not restore ${failed} ${draftWord(failed)}. Open the Discarded tab in the register to restore ${
      failed === 1 ? "it" : "them"
    }.`;
  }
  return `${restored} of ${restored + failed} drafts were restored. Open the Discarded tab in the register to restore the other ${failed}.`;
}
