"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  LoaderCircleIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatCount, formatVisitDay, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Long enough that a name typed at speed is one request, short enough that the
 *  list has settled before the doctor has finished reading what they typed. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Every chart in the clinic, searchable.
 *
 * Charts remain cards at every breakpoint: names and recency are the dominant
 * scanning cues, while age, phone and visit count stay in a consistent place.
 * This avoids turning a wide desktop register into a dense spreadsheet that
 * cannot preserve the same one-handed reading order on a phone.
 */
export function PatientDirectory({
  patients,
  totalCount,
  loading,
  error,
  query,
  onSearch,
  onOpenPatient,
}: {
  patients: PatientMatch[];
  /** Charts matching the search. Not `patients.length`. */
  totalCount: number;
  loading: boolean;
  error: string | null;
  /** The search the rows currently on screen are the answer to. */
  query: string;
  onSearch: (query: string) => void;
  onOpenPatient: (patient: PatientMatch) => void;
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
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="grid size-6 place-items-center rounded-full border border-primary/20 bg-primary/10">
              <UsersRoundIcon className="size-3.5" aria-hidden />
            </span>
            Clinical index
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Patient directory
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Every chart, organised for a fast glance between consultations.
          </p>
        </div>
        <p className="glass-inset flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-left text-xs font-medium text-muted-foreground sm:text-right">
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
            {error
              ? `${formatCount(patients.length)} shown`
              : partial
                ? `Showing ${formatCount(patients.length)} of ${formatCount(totalCount)} patients`
                : `${formatCount(totalCount)} patient${totalCount === 1 ? "" : "s"}`}
          </span>
        </p>
      </section>

      <section className="glass-strong relative overflow-hidden rounded-[1.5rem] p-3 sm:p-4">
        <div className="ambient-orb pointer-events-none absolute -right-14 -top-16 size-36 opacity-45" aria-hidden />
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
              className="glass-inset h-13 rounded-[1.1rem] border-white/10 bg-background/25 pl-11 pr-4 text-[15px] shadow-none placeholder:text-muted-foreground/65"
            />
          </div>
        </form>
      </section>

      <section aria-busy={loading} className="space-y-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not load the patient list</AlertTitle>
            <AlertDescription>
              {error} Any names below are from your last successful search.
            </AlertDescription>
          </Alert>
        )}

        {loading && blank ? (
          <div className="glass-card grid min-h-56 place-items-center rounded-[1.5rem]">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Loading patients…
            </p>
          </div>
        ) : blank ? (
          !error && <EmptyDirectory query={query} />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {patients.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPatient(patient)}
                    className={cn(
                      "glass-card group relative flex min-h-44 w-full flex-col overflow-hidden rounded-[1.4rem] p-4 text-left",
                      "transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/25 hover:bg-card/80 hover:shadow-[0_24px_70px_-34px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    )}
                  >
                    <span className="pointer-events-none absolute -right-12 -top-12 size-28 rounded-full bg-primary/8 blur-2xl transition-colors group-hover:bg-primary/14" aria-hidden />
                    <span className="relative flex w-full items-start gap-3">
                      <span aria-hidden className="relative grid size-12 shrink-0 place-items-center rounded-[1rem] border border-primary/20 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_68%)] text-sm font-semibold tracking-[-0.03em] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_30px_-18px_var(--primary)]">
                        {patientInitials(patient.full_name)}
                        <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card bg-emerald-400" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="block truncate text-[15px] font-semibold tracking-[-0.02em]">
                          {patient.full_name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {patient.age_years == null ? "Age not recorded" : `${patient.age_years} years`}
                          <span aria-hidden> · </span>
                          <span className="tnum">{maskPhone(patient.phone) ?? "No phone"}</span>
                        </span>
                      </span>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-all group-hover:border-primary/25 group-hover:bg-primary/12 group-hover:text-primary">
                        <ArrowUpRightIcon className="size-3.5" aria-hidden />
                      </span>
                    </span>

                    <span className="mt-auto grid w-full grid-cols-[auto_1fr] items-end gap-3 pt-5">
                      <span>
                        <span className="tnum block text-2xl font-semibold tracking-[-0.05em]">
                          {formatCount(patient.visit_count ?? 0)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          recorded visit{patient.visit_count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="flex items-center justify-end gap-1.5 text-right text-[11px] text-muted-foreground">
                        <CalendarClockIcon className="size-3.5 text-primary/75" aria-hidden />
                        <LastSeen occurredAt={patient.last_visit} />
                      </span>
                    </span>
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
    <div className="glass-card rounded-[1.5rem] border-dashed px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-[1rem] border border-white/10 bg-primary/10 text-primary shadow-[0_12px_30px_-18px_var(--primary)]">
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
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "PT";
}

/**
 * The visible day is short because the column is narrow; the `datetime`
 * attribute carries the full timestamp, which is what a phone's date detection
 * and anything scraping the page will read instead of guessing the year.
 */
function LastSeen({ occurredAt, prefix = "" }: { occurredAt: string | null; prefix?: string }) {
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
