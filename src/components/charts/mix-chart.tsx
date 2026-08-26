"use client";

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
        { key: "new_patients", label: "New", color: NEW, shape: "line", marker: "circle" },
        { key: "returning_patients", label: "Returning", color: RETURNING, shape: "line", dashed: true, marker: "diamond" },
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
            <XAxis
              dataKey="day"
              tickFormatter={formatDayShort}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
              tick={{ fill: "var(--axis)", fontSize: 12, fontWeight: 500 }}
              dy={8}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--axis)", fontSize: 12 }}
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
              fill="transparent"
              strokeDasharray="6 5"
              dot={<DiamondMarker color={RETURNING} />}
              activeDot={<DiamondMarker color={RETURNING} active />}
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
              fill="transparent"
              dot={<CircleMarker color={NEW} />}
              activeDot={<CircleMarker color={NEW} active />}
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

function CircleMarker({ cx = 0, cy = 0, color, active = false }: { cx?: number; cy?: number; color: string; active?: boolean }) {
  return (
    <circle cx={cx} cy={cy} r={active ? 4.5 : 2.75} fill="var(--card)" stroke={color} strokeWidth={active ? 2.5 : 2} />
  );
}

function DiamondMarker({ cx = 0, cy = 0, color, active = false }: { cx?: number; cy?: number; color: string; active?: boolean }) {
  const size = active ? 7 : 5;
  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={1}
      fill="var(--card)"
      stroke={color}
      strokeWidth={active ? 2.5 : 2}
      transform={`rotate(45 ${cx} ${cy})`}
    />
  );
}
