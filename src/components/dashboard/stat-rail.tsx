"use client";

import { motion, useReducedMotion } from "motion/react";

import { CountUp } from "@/components/reactbits/count-up";
import { formatCount } from "@/lib/format";
import type { AnalyticsPayload } from "@/lib/types";

/** A continuous metric ribbon: four readings, one visual object. */
export function StatRail({ analytics }: { analytics: AnalyticsPayload }) {
  const reduceMotion = useReducedMotion();
  const today = analytics.today;
  const seen = today?.patient_count ?? 0;

  const tiles = [
    {
      label: "Patients today",
      value: seen,
      format: formatCount,
      hint:
        analytics.deltas.patients !== null
          ? `${analytics.deltas.patients > 0 ? "+" : ""}${analytics.deltas.patients}% vs yesterday`
          : "Live clinic count",
      swatch: "var(--primary)",
    },
    {
      label: "New patients",
      value: today?.new_patients ?? 0,
      format: formatCount,
      hint: "First consultation",
      swatch: "var(--chart-1)",
    },
    {
      label: "Returning",
      value: today?.returning_patients ?? 0,
      format: formatCount,
      hint: "Continuing care",
      swatch: "var(--chart-2)",
    },
    {
      label: "Range volume",
      value: analytics.totals.patient_count,
      format: formatCount,
      hint: `${formatCount(analytics.totals.new_patients)} new · ${formatCount(analytics.totals.returning_patients)} returning`,
      swatch: "var(--primary)",
    },
  ];

  return (
    <div className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div
        className="surface-card grid min-w-[42rem] grid-cols-4 overflow-hidden rounded-[1.75rem] sm:min-w-0"
        role="list"
      >
        {tiles.map((tile, index) => (
          <motion.div
            key={tile.label}
            role="listitem"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: reduceMotion ? 0 : 0.06 * index,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="group relative min-h-32 px-5 py-5 transition-colors duration-300 hover:bg-foreground/[0.025] sm:px-6"
          >
            {index > 0 && (
              <span
                aria-hidden
                className="absolute inset-y-5 left-0 w-px bg-border"
              />
            )}
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-5 rounded-full transition-all duration-300 group-hover:w-7"
                style={{ background: tile.swatch, color: tile.swatch }}
              />
              <p className="truncate text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">
                {tile.label}
              </p>
            </div>

            <p className="tnum mt-3 text-[2rem] font-semibold leading-none tracking-[-0.055em] text-foreground">
              <CountUp
                to={tile.value}
                duration={0.9}
                delay={reduceMotion ? 0 : 0.05 * index}
                format={tile.format}
              />
            </p>

            <p className="mt-2 truncate text-xs text-muted-foreground">{tile.hint}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
