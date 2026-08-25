"use client";

import { useEffect, useState } from "react";
import { LoaderCircleIcon, SearchIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";

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
 * A real `<table>` from `sm` up and stacked rows below it. Five columns at
 * 430px is not a table, it is five illegible columns — and this app is used on
 * a phone, one-handed, between patients. The two renderings are deliberate
 * duplication: a table that has been reflowed into blocks with CSS keeps the
 * row/column semantics a screen reader announces while showing something that
 * no longer matches them.
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
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <UsersRoundIcon className="size-3.5" aria-hidden />
            Every chart in the clinic
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Patient directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open any name for that patient&rsquo;s full medical history.
          </p>
        </div>
        <p className="flex items-center gap-2 text-left text-sm text-muted-foreground sm:text-right">
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

      <section className="rounded-xl border border-border bg-card p-4 shadow-flat sm:p-5">
        <form
          onSubmit={(event) => {
            // Nothing to submit — the debounce has already asked, or is about
            // to. Enter only means "do not make me wait the last 300ms".
            event.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search by name, or the last digits of a phone number"
              aria-label="Search patients"
              maxLength={120}
              className="h-11 pl-10"
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
          <div className="grid min-h-56 place-items-center rounded-xl border border-border bg-card">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Loading patients…
            </p>
          </div>
        ) : blank ? (
          !error && <EmptyDirectory query={query} />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-flat sm:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Patients, most recently seen first. Select a name to open that chart.
                </caption>
                <thead>
                  <tr className="border-b border-border bg-secondary/45 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 font-medium">Age</th>
                    <th scope="col" className="px-4 py-3 font-medium">Phone</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Visits</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-secondary/35"
                    >
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        <button
                          type="button"
                          onClick={() => onOpenPatient(patient)}
                          className="rounded-sm text-left underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {patient.full_name}
                        </button>
                      </th>
                      <td className="tnum px-4 py-3 text-muted-foreground">
                        {patient.age_years == null ? <NotRecorded /> : patient.age_years}
                      </td>
                      <td className="tnum px-4 py-3 text-muted-foreground">
                        {maskPhone(patient.phone) ?? <NotRecorded />}
                      </td>
                      <td className="tnum px-4 py-3 text-right">
                        {formatCount(patient.visit_count ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        <LastSeen occurredAt={patient.last_visit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 sm:hidden">
              {patients.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPatient(patient)}
                    className={cn(
                      "pressable slip-flat flex w-full items-center gap-3 px-4 py-3 text-left",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                      <UserRoundIcon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {patient.full_name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {patient.age_years == null ? "Age not recorded" : `Age ${patient.age_years}`}
                        {" · "}
                        <span className="tnum">{maskPhone(patient.phone) ?? "No phone"}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-medium">
                        <span className="tnum">{formatCount(patient.visit_count ?? 0)}</span>{" "}
                        visit{patient.visit_count === 1 ? "" : "s"}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        <LastSeen occurredAt={patient.last_visit} prefix="Last seen " />
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
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary text-muted-foreground">
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
function NotRecorded() {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">Not recorded</span>
    </>
  );
}
