"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartFrame, ChartTooltip } from "@/components/charts/chart-chrome";
import { formatCount, formatDayLong, formatDayShort, todayInIndia } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

const VOLUME = "var(--chart-2)";

/**
 * Patient volume over the selected window.
 *
 * One series, so: no legend (the title already says what is plotted), a single
 * hue, and one direct label at the endpoint rather than a number on every point.
 * A value beside all thirty dots is noise that nobody reads.
 *
 * The fill is a flat 12% alpha of the line colour. The conventional treatment is
 * a vertical gradient fading out at the baseline, which is doing one job — "the
 * area is subordinate to the line" — that a single alpha already does.
 */
export function VolumeChart({
  data,
  loading,
}: {
  data: DailyPoint[];
  loading?: boolean;
}) {
  const last = data.at(-1);
  // `data.at(-1)` is the last day in the selected window, which is only today
  // when the window ends today. Labelling a stale or historical figure "today"
  // on a clinical dashboard is worse than labelling it with its date.
  const lastIsToday = last?.day === todayInIndia();
  const peak = data.reduce<DailyPoint | null>(
    (best, point) => (!best || point.patient_count > best.patient_count ? point : best),
    null,
  );

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
      // Passed unbuilt: this window is up to ninety days, and the table view
      // stays closed for all but the reader who explicitly wants the numbers.
      buildRows={() =>
        data.map((point) => ({
          day: formatDayLong(point.day),
          patients: formatCount(point.patient_count),
        }))
      }
    >
      <div className="h-44 w-full sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 34, bottom: 0, left: -18 }}>
            {/* Horizontal only, hairline, solid. Dashed gridlines read as data. */}
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />

            <XAxis
              dataKey="day"
              tickFormatter={formatDayShort}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
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
              // The crosshair finds the X so the reader aims at a date, never
              // at a 2px line.
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
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
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={VOLUME}
              fillOpacity={0.12}
              dot={false}
              // 8px marker with a 2px surface ring, so it stays legible where it
              // crosses the line.
              activeDot={{
                r: 4,
                fill: VOLUME,
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {last && (
        <p className="text-muted-foreground -mt-1 text-right text-xs">
          <span className="text-foreground tnum font-medium">
            {formatCount(last.patient_count)}
          </span>{" "}
          {lastIsToday ? "today" : `on ${formatDayShort(last.day)}`}
        </p>
      )}
    </ChartFrame>
  );
}
