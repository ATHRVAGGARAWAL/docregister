"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarRangeIcon,
  CircleCheckBigIcon,
  ClipboardClockIcon,
  LoaderCircleIcon,
  SearchIcon,
} from "@/components/icons";

import { RegisterTimeline } from "@/components/dashboard/register-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";
import type { RegisterEntry } from "@/lib/types";
import { registerPageRange } from "@/lib/register-pagination";

const RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const STATUSES = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "committed" },
  { label: "Needs review", value: "draft" },
] as const;

export function RegisterWorkspace({
  entries,
  totalCount,
  committedCount,
  draftCount,
  offset,
  limit,
  hasMore,
  loading,
  error,
  days,
  status,
  query,
  onDaysChange,
  onStatusChange,
  onQueryChange,
  onSearch,
  onPageChange,
  onReviewNext,
  onOpenPatient,
  onOpenDraft,
  onOpenVisit,
}: {
  entries: RegisterEntry[];
  totalCount: number;
  committedCount: number;
  draftCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  days: number;
  status: "all" | "committed" | "draft";
  query: string;
  onDaysChange: (days: number) => void;
  onStatusChange: (status: "all" | "committed" | "draft") => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onPageChange: (offset: number) => void;
  onReviewNext: () => void;
  onOpenPatient: (patient: PatientMatch) => void;
  onOpenDraft: (entry: RegisterEntry) => void;
  onOpenVisit: (entry: RegisterEntry) => void;
}) {
  // Both figures come from the query, not from this page. Summing `entries`
  // here made the headline the total of the first 300 rows the server returned,
  // presented as the total for the period.
  const showingPartial = totalCount > entries.length;
  const headlineCount = status === "draft" ? draftCount : status === "committed" ? committedCount : totalCount;
  const page = registerPageRange(totalCount, offset, entries.length || limit);

  return (
    <div className="space-y-5 sm:space-y-7">
      <section className="surface-elevated relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="grid size-7 place-items-center rounded-full border border-primary/20 bg-primary-soft">
                <CalendarRangeIcon className="size-3.5" aria-hidden />
              </span>
              Clinical timeline
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
              Patient register
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Every consultation, transcription and pending review in one calm,
              searchable timeline.
            </p>
          </div>

          <dl className="surface-inset grid grid-cols-3 divide-x divide-border/60 rounded-2xl px-1 py-3 sm:min-w-[22rem]">
            <div className="px-3 sm:px-5">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Matching
              </dt>
              <dd className="tnum mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground sm:text-2xl">
                {headlineCount}
              </dd>
            </div>
            <div className="px-3 sm:px-5">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <CircleCheckBigIcon className="size-3 text-primary" aria-hidden />
                Confirmed
              </dt>
              <dd className="tnum mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground sm:text-2xl">
                {committedCount}
              </dd>
            </div>
            <div className="px-3 sm:px-5">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <ClipboardClockIcon className="size-3 text-warning" aria-hidden />
                Review
              </dt>
              <dd className="tnum mt-1 text-xl font-semibold tracking-[-0.04em] text-foreground sm:text-2xl">
                {draftCount}
              </dd>
            </div>
          </dl>
        </div>
        {showingPartial && (
          <p className="relative mt-4 text-xs text-muted-foreground">
            Showing {entries.length} of {headlineCount} matching visits on this page.
          </p>
        )}
      </section>

      <section className="surface-panel rounded-[1.5rem] p-3 sm:p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search patient, diagnosis, treatment or medicine"
              aria-label="Search register"
              className="surface-inset h-12 rounded-xl border-border bg-background pl-11 shadow-none"
            />
          </div>
          <Button type="submit" size="lg" disabled={loading} className="h-12 rounded-xl px-6">
            {loading && <LoaderCircleIcon className="animate-spin" aria-hidden />}
            Search
          </Button>
        </form>

        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="no-scrollbar surface-inset flex max-w-full gap-1 overflow-x-auto rounded-xl p-1" role="group" aria-label="Register date range">
              {RANGES.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => onDaysChange(option.days)}
                  aria-pressed={days === option.days}
                  className={cn(
                    "min-h-9 shrink-0 touch-manipulation rounded-lg px-3 text-xs font-medium transition-all duration-200 [@media(pointer:coarse)]:min-h-11",
                    days === option.days
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="no-scrollbar surface-inset flex max-w-full gap-1 overflow-x-auto rounded-xl p-1" role="group" aria-label="Register status">
              {STATUSES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onStatusChange(option.value)}
                  aria-pressed={status === option.value}
                  className={cn(
                    "min-h-9 shrink-0 touch-manipulation rounded-lg border px-3 text-xs font-medium transition-all duration-200 [@media(pointer:coarse)]:min-h-11",
                    status === option.value
                      ? "border-primary/25 bg-primary-soft text-primary"
                      : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {draftCount > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onReviewNext} className="h-10 rounded-xl border-warning/20 bg-warning-soft text-warning hover:bg-warning-soft">
              Review next <ArrowRightIcon aria-hidden />
            </Button>
          )}
        </div>
      </section>

      <section aria-busy={loading} aria-labelledby="register-results-title">
        <h2 id="register-results-title" className="sr-only">
          Visit log
        </h2>
        {loading ? (
          <div className="surface-card grid min-h-64 place-items-center rounded-[1.5rem]">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Loading register…
            </p>
          </div>
        ) : error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not load the register</AlertTitle>
            <AlertDescription>
              {error} The visits below, if any, are from your last successful load.
            </AlertDescription>
          </Alert>
        ) : (
          <RegisterTimeline entries={entries} onOpenPatient={onOpenPatient} onOpenDraft={onOpenDraft} onOpenVisit={onOpenVisit} />
        )}
      </section>

      {!loading && !error && totalCount > 0 && (
        <nav className="surface-inset flex items-center justify-between rounded-2xl px-3 py-2 sm:px-4" aria-label="Register pages">
          <p className="text-xs text-muted-foreground">
            Showing {page.from}–{page.to} of {totalCount}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
              <ArrowLeftIcon aria-hidden /> Previous
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!hasMore} onClick={() => onPageChange(offset + limit)}>
              Next <ArrowRightIcon aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
