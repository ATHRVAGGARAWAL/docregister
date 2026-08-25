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
      className="slip relative p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading
            id={titleId}
            className="text-foreground text-sm font-medium tracking-tight"
          >
            {title}
          </Heading>
          {subtitle && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{subtitle}</p>
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
          className="shrink-0"
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
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((item) => (
            <li
              key={item.key}
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <span
                aria-hidden
                className={
                  item.shape === "line"
                    ? "h-0.5 w-3.5 rounded-full"
                    : "size-2.5 rounded-[3px]"
                }
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      {/* Refetch keeps the frame: the previous render stays, dimmed. No
          skeleton, no layout jump. */}
      <div
        className={`mt-4 transition-opacity duration-300 ${loading ? "opacity-40" : "opacity-100"}`}
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
    <div id={id} className="border-border mt-4 max-h-64 overflow-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        {/* Off-screen rather than absent: the heading two lines above says which
            chart this is, but a screen reader reading the table on its own —
            which is exactly how tables are read — arrives with no such context.
            Showing it would just repeat the heading to everyone else. */}
        <caption className="sr-only">{caption} — data table</caption>
        {/* Opaque, not translucent: this header scrolls over live rows and a
            see-through bar would let digits show through digits. */}
        <thead className="bg-card text-muted-foreground sticky top-0">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-border border-b px-3 py-2 font-normal ${
                  column.numeric ? "text-right" : ""
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground divide-border divide-y">
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 ${column.numeric ? "tnum text-right" : ""}`}
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
    <div className="bg-popover border-border shadow-raise pointer-events-none rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{heading}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ background: row.color }}
            />
            <span className="text-foreground tnum font-medium">{row.value}</span>
            <span className="text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
