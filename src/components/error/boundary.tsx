"use client";

import { catchError, type ErrorInfo } from "next/error";

import { DiagnosticCode } from "@/components/error/diagnostic-code";
import { useErrorDiagnostic } from "@/components/error/diagnostics";
import { TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BoundaryProps = {
  /**
   * What the panel is, as the doctor would say it — "The daily volume chart",
   * "Today's totals". It is read back to them, so it is a noun phrase and it
   * starts the sentence.
   */
  label: string;
  /** Replaces the generic reassurance when a panel needs a specific one. */
  description?: string;
  className?: string;
};

/**
 * Built on `catchError` rather than a hand-written class boundary because Next
 * puts three things in it that a bare `componentDidCatch` cannot: `retry` runs
 * the re-render inside a transition, `redirect()` and `notFound()` are let
 * through instead of being swallowed as panel failures, and the error state
 * clears by itself on a client navigation.
 */
function PanelBoundary(
  { label, description, className }: BoundaryProps,
  { error, retry }: ErrorInfo,
) {
  const diagnosticId = useErrorDiagnostic(`panel:${label}`, error);

  return (
    <div
      // Polite, not `role="alert"`. One panel failing is not worth cutting
      // across a screen reader mid-sentence while the doctor is dictating —
      // and unlike the full-page screen, nothing here has taken their focus.
      role="status"
      aria-live="polite"
      className={cn("surface-card border-destructive/40 bg-destructive-soft p-4", className)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-destructive">
          <TriangleAlertIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-[-0.015em]">{label} could not be shown</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description ?? "Everything else on this screen is unaffected, and nothing saved has changed."}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
            Try again
          </Button>
          <DiagnosticCode id={diagnosticId} className="mt-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps one panel so its failure stays that panel's failure.
 *
 * ```tsx
 * <Boundary label="The daily volume chart">
 *   <VolumeChart data={data} />
 * </Boundary>
 * ```
 */
export const Boundary = catchError(PanelBoundary);
