"use client";

import { CalendarRangeIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";

import { RegisterTimeline } from "@/components/dashboard/register-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";
import type { RegisterEntry } from "@/lib/types";

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
  loading,
  error,
  days,
  status,
  query,
  onDaysChange,
  onStatusChange,
  onQueryChange,
  onSearch,
  onOpenPatient,
}: {
  entries: RegisterEntry[];
  loading: boolean;
  error: string | null;
  days: number;
  status: "all" | "committed" | "draft";
  query: string;
  onDaysChange: (days: number) => void;
  onStatusChange: (status: "all" | "committed" | "draft") => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  const total = entries.reduce((sum, entry) => sum + (entry.fees_inr ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarRangeIcon className="size-3.5" aria-hidden />
            Searchable visit history
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Patient register
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed visits and drafts that still need your review.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="tnum text-2xl font-semibold text-money">
            {new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(total)}
          </p>
          <p className="text-xs text-muted-foreground">across {entries.length} visible visits</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-flat sm:p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search patient, diagnosis, treatment or medicine"
              aria-label="Search register"
              className="h-11 pl-10"
            />
          </div>
          <Button type="submit" size="lg" disabled={loading}>
            {loading && <LoaderCircleIcon className="animate-spin" aria-hidden />}
            Search
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="Register date range">
            {RANGES.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => onDaysChange(option.days)}
                aria-pressed={days === option.days}
                className={cn(
                  "h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors",
                  days === option.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="Register status">
            {STATUSES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusChange(option.value)}
                aria-pressed={status === option.value}
                className={cn(
                  "h-8 shrink-0 rounded-md border px-3 text-xs font-medium transition-colors",
                  status === option.value
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-busy={loading}>
        {loading ? (
          <div className="grid min-h-56 place-items-center rounded-xl border border-border bg-card">
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
          <RegisterTimeline entries={entries} onOpenPatient={onOpenPatient} />
        )}
      </section>
    </div>
  );
}
