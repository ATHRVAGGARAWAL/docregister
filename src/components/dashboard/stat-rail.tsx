"use client";

import { motion } from "motion/react";

import { CountUp } from "@/components/reactbits/count-up";
import { formatCount, formatINR } from "@/lib/format";
import type { AnalyticsPayload } from "@/lib/types";

/**
 * The supporting numbers.
 *
 * A horizontally-scrollable rail on a phone rather than a 2×2 grid. Four equal
 * boxes on a small screen is the boxy-dashboard look this app is avoiding, and
 * it forces every tile to the width of the narrowest one. A rail lets each tile
 * size to its content and reads as one continuous strip of card stock instead
 * of four competing rectangles; at `sm` and up it relaxes into four columns
 * because the horizontal room is there and scrolling to find a number is worse
 * than seeing all four.
 */
export function StatRail({ analytics }: { analytics: AnalyticsPayload }) {
  const today = analytics.today;
  const seen = today?.patient_count ?? 0;
  const averageFee = seen > 0 ? Math.round((today?.revenue_inr ?? 0) / seen) : 0;

  const tiles = [
    {
      label: "Patients today",
      value: seen,
      format: formatCount,
      hint:
        analytics.deltas.patients !== null
          ? `${analytics.deltas.patients > 0 ? "+" : ""}${analytics.deltas.patients}% vs yesterday`
          : undefined,
    },
    {
      label: "New",
      value: today?.new_patients ?? 0,
      format: formatCount,
      // The swatch, not the type, carries series identity. A chart hue stepped
      // for adjacency against its neighbours is not a legible text colour, and
      // reusing it as one is how a palette quietly fails its contrast audit.
      swatch: "var(--chart-1)",
    },
    {
      label: "Returning",
      value: today?.returning_patients ?? 0,
      format: formatCount,
      swatch: "var(--chart-2)",
    },
    {
      label: "Average fee",
      value: averageFee,
      format: formatINR,
      money: true,
      hint: `${formatCount(analytics.totals.patient_count)} visits this period`,
    },
  ];

  return (
    <div
      className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4"
      role="list"
    >
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.label}
          role="listitem"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-[10rem] shrink-0 snap-start rounded-xl border border-border bg-card px-4 py-4 shadow-flat sm:min-w-0"
        >
          <div className="flex items-center gap-1.5">
            {tile.swatch && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: tile.swatch }}
              />
            )}
            <p className="text-muted-foreground truncate text-[11px]">{tile.label}</p>
          </div>

          <p
            className={`tnum mt-2 text-2xl font-semibold tracking-tight ${
              tile.money ? "text-primary" : "text-foreground"
            }`}
          >
            <CountUp
              to={tile.value}
              duration={0.9}
              delay={0.05 * index}
              format={tile.format}
            />
          </p>

          {tile.hint && (
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">{tile.hint}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
