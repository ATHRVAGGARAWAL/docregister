"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Stethoscope } from "lucide-react";

import { MixChart } from "@/components/charts/mix-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { RecallPanel, type RecallResult } from "@/components/dashboard/recall-panel";
import { RegisterTimeline } from "@/components/dashboard/register-timeline";
import { RevenueHero } from "@/components/dashboard/revenue-hero";
import { StatRail } from "@/components/dashboard/stat-rail";
import { BlurText } from "@/components/reactbits/blur-text";
import { DotGrid } from "@/components/reactbits/dot-grid";
import { Reveal } from "@/components/reactbits/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReviewSheet } from "@/components/voice/review-sheet";
import { VoiceDock } from "@/components/voice/voice-dock";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/**
 * The dashboard shell.
 *
 * Layout intent: a single vertical column with varying rhythm — a masthead, a
 * full-bleed hero, a scrolling rail, two charts, then the day's register. No
 * 12-column grid of equal cards. The eye should be able to fall down the page
 * and find the one number that matters without parsing a layout first.
 *
 * Materially it is a desk: a dot-ruled pad behind everything (painted once in
 * the root layout), with slips of card stock laid on top of it.
 */
export function Dashboard({
  doctorName,
  initialAnalytics,
  initialEntries,
  liveProxyUrl,
  dictationLangs,
}: {
  doctorName: string;
  initialAnalytics: AnalyticsPayload;
  initialEntries: RegisterEntry[];
  liveProxyUrl: string;
  dictationLangs: string[];
}) {
  const router = useRouter();
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [range, setRange] = useState<number>(30);
  const [loadingRange, setLoadingRange] = useState(false);
  const [accessToken, setAccessToken] = useState<string | undefined>();

  const [question, setQuestion] = useState<string | null>(null);
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [recallLoading, setRecallLoading] = useState(false);

  const capture = useVoiceCapture({
    accessToken,
    liveProxyUrl,
    languages: dictationLangs,
  });

  // The live proxy needs a token it can verify. Reading it here rather than
  // passing it from the server keeps a bearer token out of the HTML payload.
  useEffect(() => {
    let cancelled = false;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAccessToken(data.session?.access_token);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRange = useCallback(async (days: number) => {
    setRange(days);
    setLoadingRange(true);
    try {
      const response = await fetch(`/api/analytics/daily?days=${days}`);
      if (response.ok) setAnalytics(await response.json());
    } finally {
      setLoadingRange(false);
    }
  }, []);

  const ask = useCallback(async (text: string, patientId?: string) => {
    setQuestion(text);
    setRecall(null);
    setRecallLoading(true);
    try {
      const response = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, patientId }),
      });
      const payload = await response.json();
      setRecall(
        response.ok
          ? payload
          : {
              answer: payload?.error ?? "Could not search your register.",
              confidence: "low",
              caveat: null,
              encounters: [],
              candidates: [],
            },
      );
    } finally {
      setRecallLoading(false);
    }
  }, []);

  const onCommitted = useCallback(() => {
    capture.reset();
    // The register and the day's totals both changed. Re-rendering the server
    // component is cheaper and less error-prone than patching local state and
    // hoping it matches what the database now says.
    router.refresh();
    void loadRange(range);
  }, [capture, loadRange, range, router]);

  return (
    <>
      {/* The ground this page sits on: a dot-ruled pad, painted once and fixed
          behind the scroller. */}
      <DotGrid className="text-foreground/[0.055] dark:text-foreground/[0.07]" />
      {/* The bottom padding is the dock's measured height plus a gap, published
          as `--dock-height` by the dock itself. It used to be a fixed `pb-48`,
          which held while the dock was idle and failed the moment it grew to
          fit the timer and live transcript — so the last rows of the register
          sat behind the one control that is always on screen. The fallback is
          the idle height, for the first frame before the observer reports. */}
      <main className="mx-auto w-full max-w-3xl px-5 pt-6 pb-[calc(var(--dock-height,11rem)+2rem)] sm:pt-10">
        {/* Masthead. A register has a heading on its first page; this is that,
            not an app bar — it scrolls away with everything else. */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="bg-primary text-primary-foreground shadow-flat grid size-8 shrink-0 place-items-center rounded-md">
              <Stethoscope className="size-4" aria-hidden />
            </span>
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              <BlurText text={`${greeting()},`} className="inline" />{" "}
              <span className="text-foreground font-medium">{doctorName}</span>
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="mt-6">
          <RevenueHero
            series={analytics.series}
            todayRevenue={analytics.today?.revenue_inr ?? 0}
            delta={analytics.deltas.revenue}
          />
        </div>

        <div className="mt-6">
          <StatRail analytics={analytics} />
        </div>

        <AnimatePresence>
          {question && (
            <div className="mt-6">
              <RecallPanel
                question={question}
                result={recall}
                loading={recallLoading}
                onDismiss={() => {
                  setQuestion(null);
                  setRecall(null);
                }}
                onPickPatient={(patientId) => ask(question, patientId)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Range filter: one row, above everything it scopes.
            A `role="group"` of pressed buttons rather than a Radix `Tabs`, even
            though it wears the segmented-control material. These do not switch
            between panels — they refetch the data inside one panel that stays
            put — and announcing them as a tablist would promise a screen-reader
            user a set of views that does not exist. The recessed track and the
            raised active segment are the same physical language either way. */}
        <div className="mt-10 flex items-center justify-between gap-3">
          <h2 className="text-foreground text-sm font-medium tracking-tight">Trends</h2>
          <div className="well inline-flex w-fit items-center gap-1 p-1" role="group" aria-label="Date range">
            {RANGES.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => loadRange(option.days)}
                aria-pressed={range === option.days}
                className={cn(
                  "pressable inline-flex h-7 items-center justify-center rounded-sm px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  range === option.days
                    ? "border-border bg-card text-foreground shadow-flat border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Reveal>
            <VolumeChart data={analytics.series} loading={loadingRange} />
          </Reveal>
          <Reveal delay={0.08}>
            <MixChart data={analytics.series.slice(-14)} loading={loadingRange} />
          </Reveal>
        </div>

        <section className="mt-12">
          <h2 className="text-foreground text-sm font-medium tracking-tight">
            Today&rsquo;s register
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {initialEntries.length} visit{initialEntries.length === 1 ? "" : "s"}
          </p>
          <motion.div layout className="mt-4">
            <RegisterTimeline entries={initialEntries} />
          </motion.div>
        </section>
      </main>

      <VoiceDock
        phase={capture.phase}
        level={capture.level}
        elapsedMs={capture.elapsedMs}
        remainingMs={capture.remainingMs}
        approachingLimit={capture.approachingLimit}
        spectrumRef={capture.spectrumRef}
        interimText={capture.interimText}
        finalText={capture.finalText}
        error={capture.error}
        onStart={() => void capture.start()}
        onStop={() => void capture.stop()}
        onCancel={capture.cancel}
        onAsk={(text) => void ask(text)}
      />

      {/* No `AnimatePresence` here: the sheet is a Radix Dialog now and runs its
          own enter/exit off `data-state`. Wrapping it in a second presence
          system would leave two owners of the same unmount. */}
      {capture.phase === "review" && capture.draft && (
        <ReviewSheet
          draft={capture.draft}
          onCommitted={onCommitted}
          onDiscard={() => {
            const id = capture.draft?.encounterId;
            if (id) void fetch(`/api/encounters/${id}`, { method: "DELETE" });
            capture.reset();
          }}
        />
      )}
    </>
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
