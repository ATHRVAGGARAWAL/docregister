"use client";

import { useEffect, useRef, useState } from "react";

import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "unavailable";

/**
 * Selects the code so a doctor whose browser refuses the clipboard can still
 * get it out with the platform's own copy gesture. `select-all` on the element
 * covers long-press and triple-click; this covers the button press that just
 * failed, where the selection is the only thing left to offer.
 */
function selectContents(node: HTMLElement | null): void {
  const selection = window.getSelection();
  if (!node || !selection) return;

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The copyable reference code.
 *
 * `navigator.clipboard` is absent outside a secure context and can be refused
 * outright by policy, and an error screen is the last place that should turn
 * into a second dead end — so every failure path here ends with the code still
 * obtainable by hand rather than with a disabled button.
 */
export function DiagnosticCode({ id, className }: { id: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state !== "copied") return;

    const timer = window.setTimeout(() => setState("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setState("copied");
    } catch {
      // Covers both a missing `clipboard` and a rejected write; neither is
      // worth telling apart, because the doctor's next move is the same.
      selectContents(codeRef.current);
      setState("unavailable");
    }
  }

  const message =
    state === "copied"
      ? "Reference code copied."
      : state === "unavailable"
        ? "This browser would not copy it. The code is selected — copy it by hand."
        : "";

  return (
    <div className={cn("surface-inset p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Reference code
          </span>
          <code ref={codeRef} className="tnum mt-1 block truncate text-sm font-semibold select-all">
            {id}
          </code>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          // A fixed accessible name, so swapping the visible label to "Copied"
          // reports the outcome through the live region below instead of
          // renaming the control a screen reader user is still sitting on.
          aria-label="Copy reference code"
          onClick={handleCopy}
        >
          {state === "copied" ? (
            <>
              <CheckIcon aria-hidden />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </Button>
      </div>
      {/* One region for both outcomes. The confirmation is redundant on screen
          — the button already says "Copied" — but the instruction is not, so
          only that one is drawn. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          state === "unavailable" ? "mt-2 text-xs leading-5 text-muted-foreground" : "sr-only",
        )}
      >
        {message}
      </p>
    </div>
  );
}
