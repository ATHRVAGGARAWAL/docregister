"use client";

import { useId, useState } from "react";
import { Table2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shared chart chrome: heading, legend, tooltip, and the table view.
 *
 * The table is not a nicety. Every value a tooltip can show has to be reachable
 * without hovering — a doctor on a phone has no hover, and a screen reader has
 * no chart. So the tooltip enhances and the table guarantees.
 */

export interface SeriesKey {
  key: string;
  label: string;
  color: string;
  /** Legends mirror the mark: a rect for bars and areas, a stroke for lines. */
  shape?: "rect" | "line";
}

export interface ChartColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export function ChartFrame({
  title,
  subtitle,
  headingLevel = 3,
  series,
  buildRows,
  columns,
  children,
  loading,
}: {
  title: string;
  subtitle?: string;
  /**
   * Charts are laid inside a section that already carries its own `h2`, so a
   * chart heading is a level below it. Hard-coding `h2` here produced an
   * outline where an h2 contained another h2 — and heading order is how most
   * screen-reader users move around a page this dense, so a wrong level is a
   * wrong map.
   */
  headingLevel?: 2 | 3 | 4;
  /** Two or more series always get a legend; one series never does. */
  series: SeriesKey[];
  /**
   * A thunk, not an array. The table is unmounted until it is asked for, and
   * passing built rows meant a 90-day window formatted 90 dates and 180 numbers
   * on every render of a chart nobody had opened — including the renders caused
   * by hovering the chart itself.
   */
  buildRows: () => Record<string, string>[];
  columns: ChartColumn[];
  children: React.ReactNode;
  loading?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  const baseId = useId();
  const tableId = `${baseId}-table`;
  const titleId = `${baseId}-title`;

  const Heading = `h${headingLevel}` as const;

  return (
    <section
      // Named, so it is exposed as a landmark and can be jumped to. An unnamed
      // <section> is a plain div to assistive tech, which on a page of four of
      // them means four indistinguishable stops.
      aria-labelledby={titleId}
      // The dim is a sighted-only cue. Without this, a refetch is a silent
      // three hundred milliseconds during which the figures being read out are
      // the previous range's.
      aria-busy={loading || undefined}
      className="glass-card group/chart relative isolate overflow-hidden rounded-[1.9rem] p-5 sm:p-6"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-48 rounded-full bg-primary/8 opacity-70 blur-3xl transition-opacity duration-500 group-hover/chart:opacity-100"
      />
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading
            id={titleId}
            className="text-[15px] font-semibold tracking-[-0.025em] text-foreground"
          >
            {title}
          </Heading>
          {subtitle && (
            <p className="mt-1 truncate text-[11px] leading-5 text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          // Advertised only while the panel exists. `aria-controls` pointing at
          // an id that is not in the document is a broken reference, and a
          // broken reference is worse than none: it is the thing a screen
          // reader offers to jump to and then cannot find.
          aria-controls={showTable ? tableId : undefined}
          className="size-9 shrink-0 rounded-full border-white/10 bg-foreground/[0.035] shadow-none hover:bg-primary/10 hover:text-primary"
        >
          {showTable ? (
            <X className="size-3.5" aria-hidden />
          ) : (
            <Table2 className="size-3.5" aria-hidden />
          )}
          <span className="sr-only">
            {showTable ? `Hide ${title} data table` : `Show ${title} data table`}
          </span>
        </Button>
      </header>

      {series.length >= 2 && (
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-2 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase"
            >
              <span
                aria-hidden
                className={
                  item.shape === "line"
                    ? "h-0.5 w-5 rounded-full shadow-[0_0_10px_currentColor]"
                    : "h-1.5 w-5 rounded-full shadow-[0_0_10px_currentColor]"
                }
                style={{ background: item.color, color: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      {/* Refetch keeps the frame: the previous render stays, dimmed. No
          skeleton, no layout jump. */}
      <div
        className={`mt-5 transition-[opacity,filter] duration-300 ${loading ? "opacity-35 blur-[1px]" : "opacity-100 blur-0"}`}
      >
        {children}
      </div>

      {/* Short-circuited, so `buildRows()` is not merely unrendered — it is
          never called. */}
      {showTable && (
        <ChartTable id={tableId} caption={title} rows={buildRows()} columns={columns} />
      )}
    </section>
  );
}

/**
 * The table view.
 *
 * Kept as its own component so the row build has an obvious single call site
 * that only exists while the panel is open.
 */
function ChartTable({
  id,
  caption,
  rows,
  columns,
}: {
  id: string;
  caption: string;
  rows: Record<string, string>[];
  columns: ChartColumn[];
}) {
  return (
    <div id={id} className="glass-inset mt-5 max-h-64 overflow-auto rounded-[1.2rem] border border-border/60">
      <table className="w-full text-left text-xs">
        {/* Off-screen rather than absent: the heading two lines above says which
            chart this is, but a screen reader reading the table on its own —
            which is exactly how tables are read — arrives with no such context.
            Showing it would just repeat the heading to everyone else. */}
        <caption className="sr-only">{caption} — data table</caption>
        {/* Opaque, not translucent: this header scrolls over live rows and a
            see-through bar would let digits show through digits. */}
        <thead className="sticky top-0 bg-card/95 text-muted-foreground backdrop-blur-xl">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-border/70 px-3 py-2.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${
                  column.numeric ? "text-right" : ""
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 text-foreground">
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2.5 ${column.numeric ? "tnum text-right" : ""}`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color: string;
}

/**
 * Tooltip readout.
 *
 * Value first and high-contrast, series name secondary — the legend's hierarchy
 * inverted, because by the time someone is hovering they know which series they
 * want and are after the number.
 *
 * Solid `--popover`, not a translucent pane: it is read against whatever the
 * chart happens to be painting underneath it, and a wash of gridlines behind a
 * number is how a tooltip becomes unreadable at exactly the moment it is used.
 */
export function ChartTooltip({
  heading,
  rows,
}: {
  heading: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="glass-strong pointer-events-none min-w-32 rounded-[1rem] border border-white/10 px-3.5 py-3 shadow-2xl">
      <p className="text-[10px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{heading}</p>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_9px_currentColor]"
              style={{ background: row.color, color: row.color }}
            />
            <span className="tnum font-semibold text-foreground">{row.value}</span>
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
