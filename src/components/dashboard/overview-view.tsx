"use client";

import { ArrowRightIcon, CalendarDaysIcon, HistoryIcon, Mic2Icon } from "lucide-react";

import { MixChart } from "@/components/charts/mix-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { RegisterTimeline } from "@/components/dashboard/register-timeline";
import { RevenueHero } from "@/components/dashboard/revenue-hero";
import { StatRail } from "@/components/dashboard/stat-rail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

export function OverviewView({
  doctorName,
  analytics,
  entries,
  range,
  loadingRange,
  onRangeChange,
  onStartDictation,
  onOpenRegister,
  onOpenRecall,
  onOpenPatient,
}: {
  doctorName: string;
  analytics: AnalyticsPayload;
  entries: RegisterEntry[];
  range: number;
  loadingRange: boolean;
  onRangeChange: (days: number) => void;
  onStartDictation: () => void;
  onOpenRegister: () => void;
  onOpenRecall: () => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDaysIcon className="size-3.5" aria-hidden />
            {todayLabel()}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {greeting()}, {doctorName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&rsquo;s how your clinic is moving today.
          </p>
        </div>
        <Button size="lg" onClick={onStartDictation} className="sm:w-auto">
          <Mic2Icon aria-hidden />
          Dictate a visit
        </Button>
      </section>

      <RevenueHero
        series={analytics.series}
        todayRevenue={analytics.today?.revenue_inr ?? 0}
        delta={analytics.deltas.revenue}
      />

      <StatRail analytics={analytics} />

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Clinic trends</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Revenue and visit mix over time</p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-secondary/60 p-1" role="group" aria-label="Analytics range">
            {RANGES.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => onRangeChange(option.days)}
                aria-pressed={range === option.days}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium transition-colors",
                  range === option.days
                    ? "bg-card text-foreground shadow-flat"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <VolumeChart data={analytics.series} loading={loadingRange} />
          <MixChart data={analytics.series.slice(-14)} loading={loadingRange} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Recent visits</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entries.length} visit{entries.length === 1 ? "" : "s"} today
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onOpenRegister}>
              View register <ArrowRightIcon aria-hidden />
            </Button>
          </div>
          <RegisterTimeline
            entries={entries.slice(0, 5)}
            compact
            onOpenPatient={onOpenPatient}
          />
        </section>

        <Card className="h-fit gap-0 overflow-hidden py-0">
          <CardContent className="p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <HistoryIcon className="size-5" aria-hidden />
            </span>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">Need the last prescription?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask in plain language. Every answer stays linked to the verified visits it came
              from.
            </p>
            <Button variant="outline" className="mt-5 w-full" onClick={onOpenRecall}>
              Search patient history
              <ArrowRightIcon aria-hidden />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}
