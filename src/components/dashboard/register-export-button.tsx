"use client";

import { useState } from "react";

import { CircleAlertIcon, LoaderCircleIcon, SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Take the register out of the app.
 *
 * A record a doctor cannot get out is a record they do not fully own, and the
 * practical version of that is an accountant asking for a spreadsheet. Without
 * this they keep a second register on paper, and the paper one becomes the real
 * one.
 *
 * The download is driven by an anchor rather than by reading the body into
 * memory: a year of visits is a large string, and a phone is the device this
 * runs on. Letting the browser stream it to storage is both faster and the only
 * version that cannot run a clinic's handset out of memory.
 */
export function RegisterExportButton({
  days,
  className,
}: {
  /** The range currently on screen, so the file matches what the doctor is looking at. */
  days: number;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - (days - 1) * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const url = `/api/register/export?from=${iso(from)}&to=${iso(to)}&format=csv`;

      // Asked for first, so a refusal is a message rather than a downloaded
      // file containing an error page. `withDoctor` answers JSON either way.
      const response = await fetch(url);
      if (!response.ok) {
        let message = "Could not export your register.";
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body.error === "string") message = body.error;
        } catch {
          // A non-JSON refusal is still a refusal; the fallback says so.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `register-${iso(from)}-to-${iso(to)}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on the next tick rather than immediately: Safari has not
      // finished reading the object URL when `click()` returns.
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export your register.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <SaveIcon className="size-3.5" aria-hidden />
        )}
        {busy ? "Preparing…" : "Export CSV"}
      </Button>

      {error && (
        <p role="alert" className="text-destructive mt-2 flex items-start gap-1.5 text-xs">
          <CircleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
