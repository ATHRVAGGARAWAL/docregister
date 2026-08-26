"use client";

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  HistoryIcon,
  Mic2Icon,
  SparklesIcon,
} from "@/components/icons";

import { MixChart } from "@/components/charts/mix-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { RegisterTimeline } from "@/components/dashboard/register-timeline";
import { StatRail } from "@/components/dashboard/stat-rail";
import { VisitHero } from "@/components/dashboard/visit-hero";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";

/** How many of today's visits the overview previews before deferring to the register. */
const RECENT_LIMIT = 5;

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
  rangeError,
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
  rangeError: string | null;
  onRangeChange: (days: number) => void;
  onStartDictation: () => void;
  onOpenRegister: () => void;
  onOpenRecall: () => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  return (
    <div className="space-y-9 sm:space-y-11">
      <section className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            <CalendarDaysIcon className="size-3.5 text-primary" strokeWidth={1.8} aria-hidden />
            {todayLabel()}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-balance text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.05]">
            {greeting()}, {doctorName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your practice, distilled into one calm clinical view.
          </p>
        </div>
        <Button
          size="lg"
          onClick={onStartDictation}
          className="group h-12 rounded-full px-5 sm:w-auto"
        >
          <span className="relative grid size-7 place-items-center rounded-full border border-primary-foreground">
            <Mic2Icon className="size-4 transition-transform duration-300 group-hover:scale-110" aria-hidden />
          </span>
          Dictate a visit
        </Button>
      </section>

      <VisitHero
        series={analytics.series}
        todayVisits={analytics.today?.patient_count ?? 0}
        delta={analytics.deltas.patients}
      />

      <StatRail analytics={analytics} />

      <section aria-labelledby="clinic-trends-title">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Practice intelligence
            </p>
            <h2
              id="clinic-trends-title"
              className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-foreground"
            >
              Clinic trends
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Patient volume and visit composition over time
            </p>
          </div>
          <div
            className="surface-inset inline-flex w-fit rounded-full p-1"
            role="group"
            aria-label="Analytics range"
          >
            {RANGES.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => onRangeChange(option.days)}
                aria-pressed={range === option.days}
                className={cn(
                  "h-8 min-w-12 touch-manipulation rounded-full px-3 text-xs font-semibold tracking-[0.08em] transition-colors duration-200 [@media(pointer:coarse)]:min-h-11",
                  range === option.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {rangeError && (
          <Alert variant="destructive" role="alert" className="mb-4 rounded-2xl">
            <AlertTitle>Could not load analytics</AlertTitle>
            <AlertDescription>
              {rangeError} The charts below are from the last range that loaded.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <VolumeChart data={analytics.series} loading={loadingRange} />
          <MixChart data={analytics.series.slice(-14)} loading={loadingRange} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
        <section aria-labelledby="recent-visits-title">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                Today&rsquo;s register
              </p>
              <h2
                id="recent-visits-title"
                className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-foreground"
              >
                Recent visits
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {entries.length > RECENT_LIMIT
                  ? `Latest ${RECENT_LIMIT} of ${entries.length} visits today`
                  : `${entries.length} visit${entries.length === 1 ? "" : "s"} today`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenRegister}
              className="rounded-full px-3 text-xs"
            >
              View register <ArrowRightIcon aria-hidden />
            </Button>
          </div>
          <RegisterTimeline
            entries={entries.slice(0, RECENT_LIMIT)}
            compact
            onOpenPatient={onOpenPatient}
          />
        </section>

        <aside className="surface-elevated group relative isolate h-fit min-h-72 overflow-hidden rounded-[1.5rem] p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-[1.1rem] border border-primary/20 bg-primary-soft text-primary">
              <HistoryIcon className="size-5" strokeWidth={1.7} aria-hidden />
            </span>
            <SparklesIcon className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="mt-8 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Clinical recall
          </p>
          <h2 className="mt-2 max-w-xs text-xl font-semibold leading-7 tracking-[-0.035em] text-foreground">
            Need the last prescription?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Ask naturally. Every answer stays linked to the verified visits it came from.
          </p>
          <Button
            variant="outline"
            className="mt-7 w-full rounded-full border-border bg-secondary shadow-none hover:bg-primary-soft hover:text-primary"
            onClick={onOpenRecall}
          >
            Search patient history
            <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Button>
        </aside>
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
