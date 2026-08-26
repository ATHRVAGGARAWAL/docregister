/**
 * The dashboard's URL state, parsed in one place.
 *
 * This used to be a client-only function that returned defaults when `window`
 * was undefined and the real values otherwise. That is a hydration mismatch by
 * construction: the server rendered "Overview" while the client rendered
 * whatever `?view=` said, so React discarded the server tree and re-rendered
 * the whole dashboard on every deep link and every reload.
 *
 * Next's own guidance is to read the `searchParams` prop on the page and pass
 * it down rather than reach for `useSearchParams` in the client, and that is
 * what the register page now does. The parse lives here so there is exactly one
 * definition of what a valid `?view=` or `?days=` is, rather than a server copy
 * and a client copy that can drift apart silently.
 */

import type { AppView } from "@/components/dashboard/app-navigation";

export type RegisterStatus = "all" | "committed" | "draft" | "discarded";

export const DEFAULT_REGISTER_DAYS = 30;

/** The ranges the register filter offers. Anything else is not a range. */
const REGISTER_DAY_CHOICES = [1, 7, 30, 90];

export interface DashboardUrlState {
  view: AppView;
  days: number;
  status: RegisterStatus;
  query: string;
  offset: number;
}

/** What `page.tsx` receives: repeated keys arrive as an array. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value only. `?view=a&view=b` is a malformed URL, not two views. */
function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function parseDashboardUrlState(params: RawSearchParams): DashboardUrlState {
  const rawView = first(params.view);
  const view: AppView =
    rawView === "register" ||
    rawView === "patients" ||
    rawView === "recall" ||
    rawView === "follow-ups" ||
    rawView === "accounts" ||
    rawView === "settings"
      ? rawView
      : "overview";

  const rawStatus = first(params.status);
  const status: RegisterStatus =
    rawStatus === "committed" || rawStatus === "draft" || rawStatus === "discarded"
      ? rawStatus
      : "all";

  const days = Number(first(params.days));
  const offset = Number(first(params.offset));

  return {
    view,
    days: REGISTER_DAY_CHOICES.includes(days) ? days : DEFAULT_REGISTER_DAYS,
    status,
    query: first(params.q) ?? "",
    offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  };
}
