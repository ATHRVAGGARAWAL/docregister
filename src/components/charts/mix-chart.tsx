"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame, ChartTooltip } from "@/components/charts/chart-chrome";
import { formatCount, formatDayLong, formatDayShort } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

/**
 * New vs returning patients.
 *
 * A stacked column per day rather than a donut. The split *today* is two
 * numbers, and a two-slice pie of two numbers is a worse stat tile; stacking it
 * across the window shows the mix and the volume at once, which is the question
 * actually being asked ("is my practice growing or just busy?").
 *
 * Both series carry the 2px surface gap between segments — the separation is
 * negative space, never a stroke drawn around the mark.
 */

const NEW = "var(--chart-1)";
const RETURNING = "var(--chart-2)";
const SURFACE_GAP = 2;
const CORNER = 4;

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** Set on the segment that sits at the top of the stack. */
  top?: boolean;
  payload?: DailyPoint;
}

/**
 * Rounded data-end, square baseline, and the surface gap taken out of the
 * segment's own height rather than painted over it.
 */
function Segment({ x = 0, y = 0, width = 0, height = 0, fill, top, payload }: SegmentProps) {
  if (height <= 0 || width <= 0) return null;

  // The bottom segment becomes the data-end when nothing is stacked above it.
  const isDataEnd = top || (payload?.returning_patients ?? 0) === 0;

  // Only the upper segment gives up height for the gap; the lower one keeps its
  // full extent so the stack still sums to the true total.
  const gap = top && (payload?.new_patients ?? 0) > 0 ? SURFACE_GAP : 0;
  const drawHeight = Math.max(0, height - gap);
  if (drawHeight <= 0) return null;

  const radius = Math.min(CORNER, drawHeight, width / 2);

  const path = isDataEnd
    ? `M${x},${y + drawHeight}
       L${x},${y + radius}
       Q${x},${y} ${x + radius},${y}
       L${x + width - radius},${y}
       Q${x + width},${y} ${x + width},${y + radius}
       L${x + width},${y + drawHeight}
       Z`
    : `M${x},${y} L${x + width},${y} L${x + width},${y + drawHeight} L${x},${y + drawHeight} Z`;

  return <path d={path} fill={fill} />;
}

export function MixChart({
  data,
  loading,
}: {
  data: DailyPoint[];
  loading?: boolean;
}) {
  const totals = data.reduce(
    (acc, point) => ({
      fresh: acc.fresh + point.new_patients,
      repeat: acc.repeat + point.returning_patients,
    }),
    { fresh: 0, repeat: 0 },
  );
  const all = totals.fresh + totals.repeat;
  const newShare = all > 0 ? Math.round((totals.fresh / all) * 100) : 0;

  return (
    <ChartFrame
      title="New vs returning"
      subtitle={
        all > 0
          ? `${newShare}% of visits were first-time patients`
          : "No visits in this window yet"
      }
      series={[
        { key: "new_patients", label: "New", color: NEW, shape: "rect" },
        { key: "returning_patients", label: "Returning", color: RETURNING, shape: "rect" },
      ]}
      loading={loading}
      columns={[
        { key: "day", label: "Day" },
        { key: "fresh", label: "New", numeric: true },
        { key: "repeat", label: "Returning", numeric: true },
      ]}
      buildRows={() =>
        data.map((point) => ({
          day: formatDayLong(point.day),
          fresh: formatCount(point.new_patients),
          repeat: formatCount(point.returning_patients),
        }))
      }
    >
      <div className="h-44 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
            barCategoryGap="26%"
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />

            <XAxis
              dataKey="day"
              tickFormatter={formatDayShort}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
              tick={{ fill: "var(--axis)", fontSize: 11 }}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--axis)", fontSize: 11 }}
            />

            <Tooltip
              // No crosshair on bars — the mark is the hit target. The band wash
              // is the "this one responded" cue. A token rather than a white
              // alpha, because on the paper theme a white wash is invisible and
              // the hover feedback would silently disappear in one of the two
              // themes this app ships.
              cursor={{ fill: "var(--secondary)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    heading={formatDayLong(String(label))}
                    rows={[
                      {
                        label: "new",
                        value: formatCount(
                          Number(payload.find((p) => p.dataKey === "new_patients")?.value ?? 0),
                        ),
                        color: NEW,
                      },
                      {
                        label: "returning",
                        value: formatCount(
                          Number(
                            payload.find((p) => p.dataKey === "returning_patients")?.value ?? 0,
                          ),
                        ),
                        color: RETURNING,
                      },
                    ]}
                  />
                ) : null
              }
            />

            {/* Colour follows the entity: "new" is always this teal, whatever
                the date range or the sort order. */}
            <Bar
              dataKey="new_patients"
              stackId="visits"
              fill={NEW}
              maxBarSize={24}
              shape={<Segment />}
              isAnimationActive={false}
            />
            <Bar
              dataKey="returning_patients"
              stackId="visits"
              fill={RETURNING}
              maxBarSize={24}
              shape={<Segment top />}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
