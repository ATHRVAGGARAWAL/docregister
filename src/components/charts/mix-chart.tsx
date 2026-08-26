"use client";

import { useId } from "react";
import { useReducedMotion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartFrame, ChartTooltip } from "@/components/charts/chart-chrome";
import { formatCount, formatDayLong, formatDayShort } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

const NEW = "var(--chart-1)";
const RETURNING = "var(--chart-2)";

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
  const rawId = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();

  return (
    <ChartFrame
      title="Patient mix"
      subtitle={
        all > 0
          ? `${newShare}% first-time patients across this window`
          : "No visits in this window yet"
      }
      series={[
        { key: "new_patients", label: "New", color: NEW, shape: "line" },
        { key: "returning_patients", label: "Returning", color: RETURNING, shape: "line" },
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
      <div className="h-48 w-full sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -34 }}>
            <defs>
              <linearGradient id={`${rawId}-new`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NEW} stopOpacity={0.42} />
                <stop offset="58%" stopColor={NEW} stopOpacity={0.1} />
                <stop offset="100%" stopColor={NEW} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${rawId}-returning`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RETURNING} stopOpacity={0.42} />
                <stop offset="58%" stopColor={RETURNING} stopOpacity={0.1} />
                <stop offset="100%" stopColor={RETURNING} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="day"
              tickFormatter={formatDayShort}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
              tick={{ fill: "var(--axis)", fontSize: 10, fontWeight: 500 }}
              dy={8}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--axis)", fontSize: 10 }}
              tickCount={4}
            />

            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeOpacity: 0.2 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    heading={formatDayLong(String(label))}
                    rows={[
                      {
                        label: "new",
                        value: formatCount(
                          Number(payload.find((point) => point.dataKey === "new_patients")?.value ?? 0),
                        ),
                        color: NEW,
                      },
                      {
                        label: "returning",
                        value: formatCount(
                          Number(
                            payload.find((point) => point.dataKey === "returning_patients")?.value ?? 0,
                          ),
                        ),
                        color: RETURNING,
                      },
                    ]}
                  />
                ) : null
              }
            />

            <Area
              type="monotone"
              dataKey="returning_patients"
              stroke={RETURNING}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${rawId}-returning)`}
              dot={false}
              activeDot={<GlowDot color={RETURNING} />}
              isAnimationActive={!reduceMotion}
              animationDuration={950}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="new_patients"
              stroke={NEW}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={`url(#${rawId}-new)`}
              dot={false}
              activeDot={<GlowDot color={NEW} />}
              isAnimationActive={!reduceMotion}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function GlowDot({ cx = 0, cy = 0, color }: { cx?: number; cy?: number; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.14} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
    </g>
  );
}
