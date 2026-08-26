"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, ActivityIcon } from "@/components/icons";

import { CountUp } from "@/components/reactbits/count-up";
import { formatCount, formatDayShort } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VisitHero({
  series,
  todayVisits,
  delta,
}: {
  series: DailyPoint[];
  todayVisits: number;
  delta: number | null;
}) {
  const points = series.slice(-12);
  const up = (delta ?? 0) >= 0;
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="surface-elevated grid overflow-hidden rounded-[1.25rem] md:min-h-[18rem] md:grid-cols-[minmax(15rem,0.72fr)_minmax(22rem,1.28fr)]"
    >
      <div className="flex flex-col justify-between p-4 sm:p-6 md:border-r md:border-border">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Live practice
          </p>
          <p className="mt-3 text-[13px] font-medium tracking-[-0.01em] text-muted-foreground sm:mt-5">
            Today&rsquo;s visits
          </p>
          <p className="tnum mt-1 text-[3.25rem] font-semibold leading-[0.9] tracking-[-0.07em] text-foreground sm:text-[5rem]">
            <CountUp to={todayVisits} duration={1} format={formatCount} />
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-3">
          {delta !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                up
                  ? "border-primary/20 bg-primary-soft text-primary"
                  : "border-destructive/20 bg-destructive-soft text-destructive",
              )}
            >
              {up ? (
                <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" strokeWidth={2} aria-hidden />
              )}
              <span className="tnum">
                {up ? "+" : "−"}
                {Math.abs(delta)}%
              </span>
            </span>
          )}
          <span className="text-xs text-muted-foreground">compared with yesterday</span>
        </div>
      </div>

      <div className="flex min-h-[11rem] flex-col justify-between border-t border-border p-4 sm:min-h-[16rem] sm:p-6 md:border-t-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Clinical tempo
            </p>
            <p className="mt-1.5 hidden max-w-sm text-sm leading-6 text-muted-foreground sm:block">
              A quiet view of patient flow across the latest twelve clinic days.
            </p>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary-soft text-primary">
            <ActivityIcon className="size-[18px]" strokeWidth={1.8} aria-hidden />
          </span>
        </div>
        <VisitSparkline points={points} />
      </div>
    </motion.section>
  );
}

function VisitSparkline({ points }: { points: DailyPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="mt-8 grid min-h-32 place-items-center rounded-[1.5rem] border border-dashed border-border/60 text-xs text-muted-foreground">
        Visit rhythm appears after two clinic days.
      </div>
    );
  }

  const width = 520;
  const height = 150;
  const inset = 10;
  const values = points.map((point) => point.patient_count);
  const max = Math.max(...values, 1);
  const coords = points.map((point, index) => ({
    x: inset + (index / (points.length - 1)) * (width - inset * 2),
    y: height - inset - (point.patient_count / max) * (height - inset * 3),
  }));
  const line = smoothPath(coords);
  const area = `${line} L${coords.at(-1)!.x},${height} L${coords[0].x},${height} Z`;
  const end = coords.at(-1)!;

  return (
    <figure className="mt-4 w-full sm:mt-7">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible sm:h-36"
        role="img"
        aria-label={`Visits over the last ${points.length} days, ${formatCount(values[0])} to ${formatCount(values.at(-1))}`}
      >
        <path d={area} fill="var(--primary)" fillOpacity={0.08} />
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r={8}
          fill="var(--primary)"
          fillOpacity={0.18}
        />
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
      <figcaption className="mt-1 flex items-center justify-between text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
        <span>{formatDayShort(points[0].day)}</span>
        <span className="tnum rounded-full border border-border bg-secondary px-2.5 py-1 tracking-normal normal-case">
          peak {formatCount(max)}
        </span>
        <span>{formatDayShort(points.at(-1)!.day)}</span>
      </figcaption>
    </figure>
  );
}

function smoothPath(points: { x: number; y: number }[]): string {
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C${midpoint.toFixed(1)},${previous.y.toFixed(1)} ${midpoint.toFixed(1)},${point.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`);
}
