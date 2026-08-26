"use client";

import { motion, useReducedMotion } from "motion/react";

import { CountUp } from "@/components/reactbits/count-up";
import { formatCount } from "@/lib/format";
import type { AnalyticsPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <div
      className="surface-card grid grid-cols-2 overflow-hidden rounded-[1.35rem] sm:grid-cols-4 sm:rounded-[1.75rem]"
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
            className={cn(
              "group relative min-h-28 px-3.5 py-4 transition-colors duration-300 hover:bg-foreground/[0.025] sm:min-h-32 sm:px-6 sm:py-5",
              index % 2 === 1 && "border-l border-border",
              index >= 2 && "border-t border-border sm:border-t-0",
              index > 0 && "sm:border-l",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-5 rounded-full transition-all duration-300 group-hover:w-7"
                style={{ background: tile.swatch, color: tile.swatch }}
              />
              <p className="truncate text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:text-xs sm:tracking-[0.13em]">
                {tile.label}
              </p>
            </div>

            <p className="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-[-0.055em] text-foreground tabular-nums sm:mt-3 sm:text-[2rem]">
              <CountUp
                to={tile.value}
                duration={0.9}
                delay={reduceMotion ? 0 : 0.05 * index}
                format={tile.format}
              />
            </p>

            <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">{tile.hint}</p>
          </motion.div>
        ))}
    </div>
  );
}
