"use client";

import { useReducedMotion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartFrame, ChartTooltip } from "@/components/charts/chart-chrome";
import { formatCount, formatDayLong, formatDayShort, todayInIndia } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

const VOLUME = "var(--chart-2)";

export function VolumeChart({
  data,
  loading,
}: {
  data: DailyPoint[];
  loading?: boolean;
}) {
  const last = data.at(-1);
  const lastIsToday = last?.day === todayInIndia();
  const peak = data.reduce<DailyPoint | null>(
    (best, point) => (!best || point.patient_count > best.patient_count ? point : best),
    null,
  );
  const reduceMotion = useReducedMotion();

  return (
    <ChartFrame
      title="Patient volume"
      subtitle={`${data.length} days · peak ${peak ? formatCount(peak.patient_count) : "—"} on ${peak ? formatDayShort(peak.day) : "—"}`}
      series={[
        { key: "patient_count", label: "Patients", color: VOLUME, shape: "line" },
      ]}
      loading={loading}
      columns={[
        { key: "day", label: "Day" },
        { key: "patients", label: "Patients", numeric: true },
      ]}
      buildRows={() =>
        data.map((point) => ({
          day: formatDayLong(point.day),
          patients: formatCount(point.patient_count),
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
              minTickGap={34}
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
              cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeOpacity: 0.25 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    heading={formatDayLong(String(label))}
                    rows={[
                      {
                        label: "patients",
                        value: formatCount(Number(payload[0].value)),
                        color: VOLUME,
                      },
                    ]}
                  />
                ) : null
              }
            />

            <Area
              type="monotone"
              dataKey="patient_count"
              stroke={VOLUME}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="transparent"
              dot={false}
              activeDot={<VolumeMarker color={VOLUME} />}
              isAnimationActive={!reduceMotion}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {last && (
        <p className="mt-1 flex items-center justify-end gap-2 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <span className="size-1.5 rounded-full bg-chart-2" aria-hidden />
          <span>
            <span className="tnum font-semibold tracking-normal text-foreground">
              {formatCount(last.patient_count)}
            </span>{" "}
            {lastIsToday ? "today" : `on ${formatDayShort(last.day)}`}
          </span>
        </p>
      )}
    </ChartFrame>
  );
}

function VolumeMarker({ cx = 0, cy = 0, color }: { cx?: number; cy?: number; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={4.5} fill="var(--card)" stroke={color} strokeWidth={2.5} />
    </g>
  );
}
