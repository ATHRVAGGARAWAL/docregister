"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  LoaderCircleIcon,
  SearchIcon,
  UsersRoundIcon,
  PlusIcon,
} from "@/components/icons";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatCount, formatVisitDay, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Long enough that a name typed at speed is one request, short enough that the
 *  list has settled before the doctor has finished reading what they typed. */
const SEARCH_DEBOUNCE_MS = 300;

/** A searchable directory with stable positions for demographics and recency. */
/**
 * Last-visit windows.
 *
 * "Today" is the one a clinic reaches for at the end of a day. There is no 90
 * option deliberately: a month is the recall rhythm a dentist thinks in, and
 * past that the honest answer is the whole directory, which is what "All" is.
 */
const RECENCY = [
  { label: "Today", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
] as const;

export function PatientDirectory({
  patients,
  totalCount,
  loading,
  hasLoaded,
  error,
  query,
  onSearch,
  days,
  onDaysChange,
  onOpenPatient,
  onNewVisit,
}: {
  patients: PatientMatch[];
  /** Charts matching the search. Not `patients.length`. */
  totalCount: number;
  loading: boolean;
  /** False until the first request has settled, however it settled. */
  hasLoaded: boolean;
  error: string | null;
  /** The search the rows currently on screen are the answer to. */
  query: string;
  onSearch: (query: string) => void;
  /** Recency window in days; 0 is the whole directory. */
  days: number;
  onDaysChange: (days: number) => void;
  onOpenPatient: (patient: PatientMatch) => void;
  onNewVisit: () => void;
}) {
  // The box is typed into far faster than the network answers, so what is in it
  // is local and only becomes `query` once it has stopped changing.
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    // Already the search on screen — including immediately after the timer
    // fires, which is what stops this rescheduling itself forever.
    if (draft.trim() === query.trim()) return;
    const timer = setTimeout(() => onSearch(draft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, query, onSearch]);

  // The page can be smaller than the result, and saying "214 patients" above a
  // list of 50 is a lie the doctor cannot see. Both numbers, or neither.
  const partial = totalCount > patients.length;
  const blank = patients.length === 0;

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Patient records
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Patient directory
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Find a patient, review their history or start their next visit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onNewVisit}>
            <PlusIcon aria-hidden />
            New visit
          </Button>
          {/*
            Filtered in Postgres, not here — see `loadPatients`. A window
            applied to the fetched page would narrow fifty rows and still report
            the count for the whole directory.
          */}
          <div
            className="surface-inset flex w-fit items-center gap-1 rounded-full p-1"
            role="group"
            aria-label="Filter by last visit"
          >
            {RECENCY.map((option) => {
              const active = days === option.days;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDaysChange(option.days)}
                  className={cn(
                    "pressable min-w-11 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="surface-inset flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-left text-xs font-medium text-muted-foreground sm:text-right">
            {loading && !blank && (
              <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
            )}
            {/* `totalCount` describes the last SUCCESSFUL response. After a
              failed load it is still whatever it was — 0 on the first attempt —
              so rendering it beside "Could not load patients" put a confident
              "0 patients" above an error that says the number is unknown. When
              the last request failed, the only honest count is the one we can
              see. */}
            <span className="tnum">
              {!hasLoaded
                ? "Loading patients…"
                : error
                  ? `${formatCount(patients.length)} shown`
                  : partial
                    ? `Showing ${formatCount(patients.length)} of ${formatCount(totalCount)} patients`
                    : `${formatCount(totalCount)} patient${totalCount === 1 ? "" : "s"}`}
            </span>
          </p>
        </div>
      </section>

      <section className="relative rounded-xl border border-border bg-background p-3">
        <form
          onSubmit={(event) => {
            // Nothing to submit — the debounce has already asked, or is about
            // to. Enter only means "do not make me wait the last 300ms".
            event.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <div className="relative z-10">
            <SearchIcon
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary"
              aria-hidden
            />
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search by name, or the last digits of a phone number"
              aria-label="Search patients"
              maxLength={120}
              className="h-11 rounded-lg bg-background pl-11 pr-20 text-sm"
              data-shortcut-search
            />
            {draft && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => {
                  setDraft("");
                  onSearch("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>
      </section>

      <section aria-busy={loading || !hasLoaded} className="space-y-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not load the patient list</AlertTitle>
            <AlertDescription>
              {error} Any names below are from your last successful search.
              <Button
                variant="outline"
                size="sm"
                className="ml-3"
                onClick={() => onSearch(draft.trim())}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && blank ? (
          <div className="surface-card grid min-h-56 place-items-center rounded-[1.5rem]">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Loading patients…
            </p>
          </div>
        ) : blank ? (
          !error && (
            <>
              <EmptyDirectory query={query} />
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={onNewVisit}>
                  <PlusIcon aria-hidden />
                  Start a new visit
                </Button>
              </div>
            </>
          )
        ) : (
          <>
            <ul className="overflow-hidden rounded-xl border border-border bg-background divide-y divide-border">
              {patients.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPatient(patient)}
                    className="group flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary sm:gap-4 sm:px-5"
                  >
                    <span className="workspace-initials" aria-hidden>
                      {patientInitials(patient.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-semibold">
                        {patient.full_name}
                      </strong>
                      <small className="mt-1 block text-xs text-muted-foreground">
                        {patient.age_years == null
                          ? "Age not recorded"
                          : `${patient.age_years} years`}{" "}
                        · {maskPhone(patient.phone) ?? "No phone"}
                      </small>
                    </span>
                    <span className="hidden min-w-20 text-sm sm:block">
                      {formatCount(patient.visit_count ?? 0)}{" "}
                      <span className="text-xs text-muted-foreground">
                        visits
                      </span>
                    </span>
                    <span className="hidden min-w-32 text-right text-xs text-muted-foreground sm:block">
                      <LastSeen occurredAt={patient.last_visit} />
                    </span>
                    <ArrowUpRightIcon
                      className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * "Nothing here" and "nothing matched" are different facts and lead to
 * different actions — one is a clinic that has not started, the other is a
 * search worth retyping — so they are never shown the same sentence.
 */
function EmptyDirectory({ query }: { query: string }) {
  const searching = query.trim().length > 0;
  return (
    <div className="surface-card rounded-[1.5rem] border-dashed px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-[1rem] border border-border bg-primary-soft text-primary">
        <UsersRoundIcon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-medium">
        {searching ? `No patients match “${query.trim()}”` : "No patients yet"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {searching
          ? "Try fewer letters, a different spelling, or the last digits of a phone number."
          : "A chart appears here the first time you confirm a dictated visit."}
      </p>
    </div>
  );
}

function patientInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "PT"
  );
}

/**
 * The visible day is short because the column is narrow; the `datetime`
 * attribute carries the full timestamp, which is what a phone's date detection
 * and anything scraping the page will read instead of guessing the year.
 */
function LastSeen({
  occurredAt,
  prefix = "",
}: {
  occurredAt: string | null;
  prefix?: string;
}) {
  const day = formatVisitDay(occurredAt);
  if (!day) return <span className="text-muted-foreground">No visits yet</span>;
  return (
    <time dateTime={occurredAt ?? undefined}>
      {prefix}
      {day}
    </time>
  );
}

/**
 * An em dash is the right mark in a dense column and the wrong thing to hear:
 * a screen reader either skips it or reads punctuation, neither of which is
 * "we do not have this".
 */
