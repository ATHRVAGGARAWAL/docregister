"use client";

import dynamic from "next/dynamic";

import { LoaderCircleIcon } from "@/components/icons";

/**
 * The practice workspaces, deferred off the register's first load.
 *
 * These came from what used to be a second application at `/(practice)`, with
 * its own shell and its own sidebar. Folding them into the register removed
 * that split — but it would also have put five more workspaces into the bundle
 * a doctor downloads before they can press the record key, and the register's
 * whole argument is that the first paint carries real numbers on a clinic's
 * mobile connection. Every one of them is behind a nav click, so none of them
 * needs to be in the first chunk.
 *
 * `ssr: false` for the same reason `lazy/charts.tsx` uses it: each of these
 * fetches its own data on mount, so a server render is an empty frame either
 * way and would only cost a preload hint for a chunk most sessions never open.
 */
export const ScheduleWorkspace = dynamic(
  () => import("@/components/practice/schedule-workspace").then((m) => m.ScheduleWorkspace),
  { ssr: false, loading: () => <WorkspacePending /> },
);

export const TreatmentsWorkspace = dynamic(
  () => import("@/components/practice/treatments-workspace").then((m) => m.TreatmentsWorkspace),
  { ssr: false, loading: () => <WorkspacePending /> },
);

export const OperationsWorkspace = dynamic(
  () => import("@/components/practice/operations-workspace").then((m) => m.OperationsWorkspace),
  { ssr: false, loading: () => <WorkspacePending /> },
);

export const FinanceWorkspace = dynamic(
  () => import("@/components/practice/finance-workspace").then((m) => m.FinanceWorkspace),
  { ssr: false, loading: () => <WorkspacePending /> },
);

export const ReportsWorkspace = dynamic(
  () => import("@/components/practice/reports-workspace").then((m) => m.ReportsWorkspace),
  { ssr: false, loading: () => <WorkspacePending /> },
);

/**
 * The wait, said plainly. `ChartPending` wants a chart's title and draws a
 * chart-shaped skeleton; these are whole workspaces, and a skeleton that
 * promises the wrong layout is worse than a line that promises nothing.
 */
function WorkspacePending() {
  return (
    <p className="py-16 text-center text-sm text-muted-foreground">
      <LoaderCircleIcon className="mr-2 inline size-4 animate-spin" aria-hidden />
      Loading…
    </p>
  );
}
