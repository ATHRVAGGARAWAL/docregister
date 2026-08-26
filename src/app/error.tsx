"use client";

import { useEffect } from "react";

import { CircleAlertIcon } from "@/components/icons";
import { BrandLockup } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route render failed", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-md">
        <BrandLockup subtitle="Clinical workspace" />
        <section className="surface-elevated mt-6 p-6">
          <span className="grid size-11 place-items-center rounded-full bg-destructive-soft text-destructive">
            <CircleAlertIcon className="size-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-[-0.025em]">This workspace could not load</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your saved records were not changed. Try loading the workspace again.
          </p>
          <Button type="button" size="lg" className="mt-6 w-full" onClick={reset}>
            Try again
          </Button>
        </section>
      </div>
    </main>
  );
}
