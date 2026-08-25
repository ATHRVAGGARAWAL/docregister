"use client";

import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { CountUp } from "@/components/reactbits/count-up";
import { formatCompactINR, formatDayShort, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DailyPoint } from "@/lib/types";

/**
 * The one number the dashboard leads with: today's takings.
 *
 * A hero figure, not a gauge. A radial arc implies a target — "72% of the way
 * to something" — and a clinic's daily revenue has no ceiling to be 72% of, so
 * the arc would be pure decoration wearing the clothes of data. The sparkline
 * underneath carries the context the arc pretended to.
 *
 * The figure counts up (React Bits' CountUp, fed this app's `en-IN` formatter)
 * because it is the one number on the screen that changes during the day and
 * the motion is what makes a commit feel like it landed. Every other number
 * here is static.
 *
 * Exactly one hero per view; every other number on this screen is a stat tile.
 */
export function RevenueHero({
  series,
  todayRevenue,
  delta,
}: {
  series: DailyPoint[];
  todayRevenue: number;
  delta: number | null;
}) {
  // Twelve points is the sparkline contract — enough to show a shape, few
  // enough that each one is still a distinguishable step.
  const points = series.slice(-12);
  const up = (delta ?? 0) >= 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-raise md:grid-cols-[minmax(0,0.8fr)_minmax(18rem,1.2fr)]"
    >
      <div className="flex flex-col justify-between border-b border-border p-5 sm:p-6 md:border-b-0 md:border-r">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Today&rsquo;s revenue
          </p>
          <h1 className="tnum mt-3 text-[2.75rem] font-semibold leading-none tracking-[-0.045em] text-foreground sm:text-6xl">
            <CountUp to={todayRevenue} duration={1} format={formatINR} />
          </h1>
        </div>

        {delta !== null && (
          <span
            className={cn(
              "mt-5 inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              up
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-destructive/25 bg-destructive/10 text-destructive",
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            <span className="tnum">
              {up ? "+" : "−"}
              {Math.abs(delta)}%
            </span>
            <span className="text-muted-foreground font-normal">from yesterday</span>
          </span>
        )}
      </div>
      <div className="flex min-h-44 items-end p-5 sm:p-6">
        <Sparkline points={points} />
      </div>
    </motion.section>
  );
}

/**
 * Hand-drawn rather than charted: at this size the mark specs (2px stroke, 8px
 * endpoint marker with a 2px surface ring) are easier to hit exactly in SVG
 * than to coax out of a chart library's defaults.
 *
 * The fill is a flat 10% of the line colour. The usual treatment is a gradient
 * fading to nothing at the baseline; a single alpha does the same job — "this
 * is a quantity above zero" — without one.
 */
function Sparkline({ points }: { points: DailyPoint[] }) {
  if (points.length < 2) return null;

  const width = 320;
  const height = 52;
  const values = points.map((point) => point.revenue_inr);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * width,
    y: height - ((point.revenue_inr - min) / span) * (height - 8) - 4,
  }));

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const end = coords.at(-1)!;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-13 w-full"
        role="img"
        aria-label={`Revenue over the last ${points.length} days, ${formatINR(values[0])} to ${formatINR(values.at(-1)!)}`}
      >
        <path d={area} fill="var(--primary)" fillOpacity={0.08} />
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 2px ring in the surface colour so the endpoint stays legible where
            it sits on top of the line. */}
        <circle
          cx={end.x}
          cy={end.y}
          r={3.5}
          fill="var(--primary)"
          stroke="var(--card)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption className="text-muted-foreground mt-2 flex justify-between text-[11px]">
        <span>{formatDayShort(points[0].day)}</span>
        <span className="tnum">peak {formatCompactINR(max)}</span>
        <span>{formatDayShort(points.at(-1)!.day)}</span>
      </figcaption>
    </figure>
  );
}
