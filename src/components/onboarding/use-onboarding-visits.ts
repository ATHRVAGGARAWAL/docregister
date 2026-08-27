"use client";

import { useCallback, useEffect, useState } from "react";

import {
  VISIT_LOOKBACK_DAYS,
  type OnboardingVisitReport,
} from "@/components/onboarding/onboarding-steps";

/**
 * The register's own counts, which is where "have you recorded a visit yet?" is
 * actually answered.
 *
 * One page of one row is the smallest thing `/api/register` will return — its
 * `limit` is clamped to at least 1 — and the row itself is dropped on arrival.
 * Only the counts are read, and none of them names a patient.
 *
 * The counts are also why this is a request rather than a prop. The dashboard's
 * own register state is a filtered, paginated view whose totals move with the
 * filters, so a checklist reading those would tell a doctor they had never
 * recorded a visit whenever they happened to have a search box filled in.
 */
const COUNT_REQUEST = `/api/register?days=${VISIT_LOOKBACK_DAYS}&limit=1`;

interface RegisterCountPayload {
  committedCount?: unknown;
  draftCount?: unknown;
}

export interface OnboardingVisits {
  report: OnboardingVisitReport;
  /** The checklist is waiting for an answer it does not have yet. */
  busy: boolean;
  reload: () => void;
}

export interface OnboardingVisitsOptions {
  /**
   * Whether the answer is wanted at all.
   *
   * `/api/register` is rate limited on the `match` bucket, 240 an hour
   * (migration 0004), and that is the same budget the doctor's own patient
   * searches draw on. The overview is remounted on every view switch, so a
   * checklist that has been put away — or one whose dismissal the browser has
   * not been asked about yet — would spend that budget on counts nobody is
   * going to see.
   */
  enabled?: boolean;
  /**
   * Change it whenever a visit is saved or confirmed, so the checklist cannot
   * keep asking for a first visit that has just been recorded.
   */
  refreshKey?: number | string;
}

/**
 * While `enabled` is false nothing is requested and the report stays
 * `checking`, which is the literal truth: the register has not been asked. A
 * caller that renders while disabled would show a spinner forever, so don't.
 */
export function useOnboardingVisits({
  enabled = true,
  refreshKey,
}: OnboardingVisitsOptions = {}): OnboardingVisits {
  const [report, setReport] = useState<OnboardingVisitReport>({ state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(COUNT_REQUEST, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`register responded ${response.status}`);

        const payload = (await response.json()) as RegisterCountPayload;
        const committed = whole(payload.committedCount);
        const draft = whole(payload.draftCount);
        // A count this checklist cannot trust is worse than no count: it is what
        // decides whether a doctor is told to record their first visit.
        if (committed === null || draft === null) {
          throw new Error("register totals missing from the response");
        }

        setReport({ state: "counted", recorded: committed + draft, committed });
      } catch (cause) {
        if (controller.signal.aborted) return;
        // The doctor is told what this means in the step itself. The console
        // keeps the detail, which can quote the request back.
        console.error("[onboarding] register count unavailable", cause);
        setReport({ state: "unavailable" });
      }
    }

    void load();
    // Aborting on the way out covers both unmount and a retry: React runs this
    // before re-running the effect, so a second request cannot land after the
    // one that replaced it.
    return () => controller.abort();
  }, [attempt, enabled, refreshKey]);

  const reload = useCallback(() => {
    // Back to "checking" rather than holding the failure on screen: the steps
    // below say "couldn't reach your register", and leaving that up while a new
    // request is in flight states something that is no longer true.
    setReport({ state: "checking" });
    setAttempt((value) => value + 1);
  }, []);

  // `checking` is the only unsettled report, so it is the whole of "waiting" —
  // a second flag would be the same fact kept in two places, free to disagree.
  return { report, busy: report.state === "checking", reload };
}

/** A count, or `null` for any value a count cannot be. */
function whole(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}
