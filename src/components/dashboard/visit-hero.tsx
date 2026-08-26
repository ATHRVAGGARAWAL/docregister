"use client";

import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

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

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-raise md:grid-cols-[minmax(0,0.8fr)_minmax(18rem,1.2fr)]"
    >
      <div className="flex flex-col justify-between border-b border-border p-5 sm:p-6 md:border-b-0 md:border-r">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today&rsquo;s visits</p>
          <h1 className="tnum mt-3 text-[2.75rem] font-semibold leading-none tracking-[-0.045em] text-foreground sm:text-6xl">
            <CountUp to={todayVisits} duration={1} format={formatCount} />
          </h1>
        </div>
        {delta !== null && (
          <span className={cn("mt-5 inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium", up ? "border-primary/25 bg-primary/10 text-primary" : "border-destructive/25 bg-destructive/10 text-destructive")}>
            {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            <span className="tnum">{up ? "+" : "−"}{Math.abs(delta)}%</span>
            <span className="font-normal text-muted-foreground">from yesterday</span>
          </span>
        )}
      </div>
      <div className="flex min-h-44 items-end p-5 sm:p-6"><VisitSparkline points={points} /></div>
    </motion.section>
  );
}

function VisitSparkline({ points }: { points: DailyPoint[] }) {
  if (points.length < 2) return null;
  const width = 320;
  const height = 52;
  const values = points.map((point) => point.patient_count);
  const max = Math.max(...values, 1);
  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * width,
    y: height - (point.patient_count / max) * (height - 8) - 4,
  }));
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const end = coords.at(-1)!;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-13 w-full" role="img" aria-label={`Visits over the last ${points.length} days, ${formatCount(values[0])} to ${formatCount(values.at(-1))}`}>
        <path d={area} fill="var(--primary)" fillOpacity={0.08} />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={end.x} cy={end.y} r={3.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{formatDayShort(points[0].day)}</span><span className="tnum">peak {formatCount(max)}</span><span>{formatDayShort(points.at(-1)!.day)}</span></figcaption>
    </figure>
  );
}
