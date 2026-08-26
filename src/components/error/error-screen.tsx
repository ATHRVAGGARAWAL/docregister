"use client";

import { useEffect, useId, useRef } from "react";

import { BrandLockup } from "@/components/brand/brand-mark";
import { DiagnosticCode } from "@/components/error/diagnostic-code";
import { useErrorDiagnostic } from "@/components/error/diagnostics";
import { TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export type ErrorScreenProps = {
  /** Names the boundary in the log line. Not shown to the doctor. */
  scope: string;
  error: unknown;
  /** Next's `retry`: refetches and re-renders in place, so state outside the boundary survives. */
  onRetry: () => void;
  /**
   * What failed, in the doctor's words. No default — a generic title is how an
   * error screen stops carrying information, and every caller knows more than
   * "Something went wrong".
   */
  title: string;
  /** What is and is not affected, and what to do next. Never the raw failure. */
  description: string;
};

/**
 * The full-page fallback, shared by the route boundary and the document-level
 * one so a doctor meets the same screen either way.
 *
 * Deliberately without a busy state on "Try again": Next's `retry` clears the
 * boundary inside a transition, so a local `retrying` flag would be racing this
 * component's own unmount rather than describing anything. The screen going
 * away is the acknowledgement.
 */
export function ErrorScreen({ scope, error, onRetry, title, description }: ErrorScreenProps) {
  const diagnosticId = useErrorDiagnostic(scope, error);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Whatever had focus is gone with the tree that threw, which drops focus to
    // the body and leaves a screen reader with no idea the page changed. The
    // heading is the one place worth landing.
    headingRef.current?.focus();
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        <BrandLockup subtitle="Clinical workspace" />
        <section className="surface-elevated mt-6 p-6" aria-labelledby={headingId}>
          <span className="grid size-11 place-items-center rounded-full bg-destructive-soft text-destructive">
            <TriangleAlertIcon className="size-5" aria-hidden />
          </span>
          <h1
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="mt-5 text-xl font-semibold tracking-[-0.025em]"
          >
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" size="lg" onClick={onRetry}>
              Try again
            </Button>
            {/* Deliberately a document request. A boundary only resets itself
                when the *pathname* changes — `ErrorBoundaryHandler` compares
                nothing else — and this app's register lives at a single
                pathname under varying search params, so `<Link href="/">` from
                a failed `/?view=…` would leave this screen mounted over a page
                it had already refetched. The escape hatch cannot be the thing
                that quietly does nothing. */}
            <Button asChild variant="outline" size="lg">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above: a soft navigation cannot clear this boundary. */}
              <a href="/">Reopen the register</a>
            </Button>
          </div>
          <DiagnosticCode id={diagnosticId} className="mt-6" />
        </section>
      </div>
    </main>
  );
}
