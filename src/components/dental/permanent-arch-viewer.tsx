"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";

import { ToothChart } from "@/components/dental/tooth-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { statusLabel, summariseMouth, type ToothStatus } from "@/lib/dental/tooth-status";
import { chartOrder, toothLabel } from "@/lib/dental/tooth";
import { cn } from "@/lib/utils";

const PermanentArchScene = dynamic(
  () => import("./permanent-arch-scene").then((module) => module.PermanentArchScene),
  {
    ssr: false,
    loading: () => <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">Preparing the 3D chart…</div>,
  },
);

export function PermanentArchViewer({
  status,
  className,
  label = "Permanent dentition",
}: {
  status?: ReadonlyMap<number, ToothStatus>;
  className?: string;
  label?: string;
}) {
  // The odontogram is the clinical default: it is faster to scan, works on
  // every device and keeps FDI positions fixed. The 3D view remains available
  // when a dentist wants to inspect the spatial model, but it no longer makes
  // the chart feel like a demo before it feels like a record.
  const [mode, setMode] = useState<"3d" | "diagram">("diagram");
  const [focused, setFocused] = useState<number | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const summary = useMemo(() => summariseMouth(new Map(status ?? [])), [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const canvas = document.createElement("canvas");
        setWebgl(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
      } catch {
        setWebgl(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const diagram = <ToothChart status={status} label={`${label} diagram`} />;

  return (
    <section className={cn("overflow-hidden rounded-[1.35rem] border border-border bg-card", className)} aria-label={label}>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Dental chart</h3>
            <Badge variant="outline" className="border-primary/20 bg-primary-soft text-primary">FDI · permanent</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Current tooth state derived from confirmed visits. No mark means no history recorded.
          </p>
        </div>
        <SegmentedControl aria-label="Dental chart view">
          <SegmentedControlItem selected={mode === "diagram"} onClick={() => setMode("diagram")}>Clinical chart</SegmentedControlItem>
          <SegmentedControlItem selected={mode === "3d"} onClick={() => setMode("3d")}>3D inspect</SegmentedControlItem>
        </SegmentedControl>
      </div>

      {mode === "diagram" || webgl === false ? (
        <div className="p-3 sm:p-5">
          {webgl === false && (
            <p className="mb-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-foreground">
              3D is unavailable on this device, so the clinical diagram is shown instead.
            </p>
          )}
          {diagram}
        </div>
      ) : (
        <ArchErrorBoundary fallback={<div className="p-3 sm:p-5">{diagram}</div>}>
          <div className="relative h-[22rem] bg-[#f7faf9] dark:bg-[#101715] sm:h-[27rem]">
            {webgl && (
              <PermanentArchScene
                status={status}
                focused={focused}
                onFocus={(fdi) => setFocused(fdi || null)}
              />
            )}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
              <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-flat" aria-live="polite" aria-atomic="true">
                {focused ? (
                  <>
                    <p className="font-semibold"><span className="tnum">{focused}</span> · {toothLabel(focused)}</p>
                    <p className="mt-0.5 text-muted-foreground">{statusLabel(status?.get(focused))}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a tooth to inspect it.</p>
                )}
              </div>
              <p className="hidden rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-flat sm:block">
                {summary.treated} with history · {summary.missing} missing · {summary.implants} implants
              </p>
            </div>
          </div>
        </ArchErrorBoundary>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 text-xs">
        {mode === "3d" && webgl !== false && (
          <ToothSelector status={status} focused={focused} onFocus={setFocused} />
        )}
        <Legend colour="#f0e4cc" label="No recorded history" />
        <Legend colour="#e9a46f" label="Active finding" />
        <Legend colour="#8fc9bd" label="Restored" />
        <Legend colour="#edc47b" label="Root treated" />
        <Legend colour="#87b9d8" label="Crowned" />
        <Legend colour="#a8b1b5" label="Implant" />
        {focused && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFocused(null)} className="ml-auto">
            Clear focus
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * A canvas cannot expose its individual meshes as native controls. This
 * selector is the semantic equivalent of selecting a 3D tooth: it follows the
 * visual chart order, names every tooth in words and updates the same focused
 * state the pointer handlers use. Keeping it outside the canvas means it never
 * intercepts a drag or click on the model.
 */
function ToothSelector({
  status,
  focused,
  onFocus,
}: {
  status?: ReadonlyMap<number, ToothStatus>;
  focused: number | null;
  onFocus: (fdi: number | null) => void;
}) {
  return (
    <label className="inline-flex min-h-7 items-center gap-2 text-muted-foreground">
      <span className="font-medium text-foreground">Tooth</span>
      <select
        value={focused ?? ""}
        onChange={(event) => onFocus(event.currentTarget.value ? Number(event.currentTarget.value) : null)}
        className="h-7 rounded-md border border-field-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Select a tooth</option>
        {chartOrder("permanent").map((fdi) => (
          <option key={fdi} value={fdi}>
            {fdi} · {toothLabel(fdi)} · {statusLabel(status?.get(fdi))}
          </option>
        ))}
      </select>
    </label>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: colour }} aria-hidden />
      {label}
    </span>
  );
}

class ArchErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[dental-arch] WebGL viewer failed", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
