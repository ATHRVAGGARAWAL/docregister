"use client";

import { motion } from "motion/react";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  Loader2,
  Quote,
  SparklesIcon,
  TriangleAlert,
  UserRoundIcon,
  X,
} from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatDayLong } from "@/lib/format";
import type { RecallQuery } from "@/lib/llm/schema";

export interface RecallResult {
  answer: string;
  confidence: "high" | "medium" | "low";
  caveat: string | null;
  encounters: {
    id: string;
    occurred_at: string;
    diagnosis: string | null;
    patient_name: string;
    prescription: { drug_name: string; strength: string | null; frequency: string | null }[];
  }[];
  candidates: { id: string; full_name: string }[];
  resolvedPatient: { id: string; full_name: string | null } | null;
  /**
   * How the question was read. Carried back to the client because `intent`
   * decides whether the doctor gets a sentence or a chart — `open_record` means
   * they asked for the record itself, and the caller opens it. Null only for a
   * result this client built locally after the request failed.
   */
  query: RecallQuery | null;
}

/**
 * The resolved patient, as the chart sheet wants it.
 *
 * Shared rather than built at each call site because two of them now open the
 * same chart from the same result — the doctor tapping the card below, and the
 * caller acting on `open_record` without a tap — and a chart that arrived by
 * voice should be indistinguishable from one that arrived by finger.
 */
export function patientFromRecall(result: RecallResult): PatientMatch | null {
  if (!result.resolvedPatient) return null;
  return {
    id: result.resolvedPatient.id,
    full_name: result.resolvedPatient.full_name || "Patient",
    phone: null,
    age_years: null,
    last_visit: result.encounters[0]?.occurred_at ?? null,
    visit_count: result.encounters.length,
  };
}

/**
 * The answer to a historical-recall question.
 *
 * The summary is shown with the visits it was drawn from directly underneath —
 * always, not behind a "sources" toggle. A doctor acting on "you gave her
 * Azithromycin 500 last time" needs to be able to check that in one glance, and
 * a confident sentence with no visible evidence is precisely the failure mode
 * of putting a language model near a medical record.
 *
 * Materially this is a slip that has been laid on top of the dashboard rather
 * than one of its panels — same card stock, but the question sits in a recessed
 * well at the top, the way a query sits above its result on a terminal.
 */
/** How many source visits the panel lists before summarising the rest. */
const EVIDENCE_LIMIT = 4;

export function RecallPanel({
  question,
  result,
  loading,
  onDismiss,
  onPickPatient,
  onOpenPatient,
  onRecordAsVisit,
}: {
  question: string;
  result: RecallResult | null;
  loading: boolean;
  onDismiss: () => void;
  onPickPatient: (patientId: string) => void;
  onOpenPatient: (patient: PatientMatch) => void;
  /**
   * File this utterance as a consultation after all. Passed only when the
   * question was spoken, because a question the doctor typed into the box was
   * never at risk of having been a dictation.
   */
  onRecordAsVisit?: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="surface-elevated relative overflow-hidden rounded-[1.65rem] p-4 sm:p-6"
      aria-live="polite"
    >
      <header className="flex items-start justify-between gap-3">
        {/* Wraps rather than truncates. Everything below this line is an
            answer, and an answer can only be judged against the whole question
            — "what did I give Sunita last time" and "what did I give Sunita
            last time for her knee" have different right answers, and the second
            one is where the ellipsis fell. */}
        <p className="surface-inset relative flex min-w-0 flex-1 items-start gap-2.5 rounded-[1rem] px-3.5 py-3 text-sm text-muted-foreground">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words">{question}</span>
        </p>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} className="shrink-0">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Dismiss answer</span>
        </Button>
      </header>

      {/* Attached to the quoted utterance rather than to the answer, and
          rendered before the answer arrives, because it is a correction about
          what was said and not about what was found. A doctor who has just
          dictated a consultation and been shown a search knows within a second
          that the app misheard the *kind* of thing they said; making them wait
          out the lookup to say so is the whole of the frustration.

          Understated on purpose. This appears on every spoken question,
          including the large majority the classifier reads correctly, so it has
          to be findable without competing with the answer underneath it. */}
      {onRecordAsVisit && (
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-secondary px-3 py-2.5">
          <p className="text-muted-foreground text-xs">
            Meant to record a visit? Nothing was lost — the recording is saved.
          </p>
          <Button variant="outline" size="sm" onClick={onRecordAsVisit}>
            Record as a visit instead
          </Button>
        </div>
      )}

      {loading || !result ? (
        <div className="relative mt-6 grid min-h-36 place-items-center">
          <div className="text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full border border-primary/20 bg-primary-soft text-primary">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </span>
            <p className="mt-3 text-sm text-muted-foreground">Looking through your register…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mt-5 pl-4 sm:pl-5">
            <span className="absolute inset-y-1 left-0 w-px bg-primary" aria-hidden />
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <SparklesIcon className="size-3.5" aria-hidden />
              Register answer
            </p>
            <p className="text-balance text-[15px] leading-7 text-foreground sm:text-base">
              {result.answer}
            </p>
          </div>

          {/* Amber alone said "treat this carefully" to everyone who can see
              amber and nothing at all to everyone who cannot — the same
              colour-only encoding the confidence badge below refuses. The word
              carries the meaning; the tint and the icon only reinforce it. */}
          {result.caveat && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2.5 text-xs text-warning" role="note">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Caveat:</span> {result.caveat}
              </span>
            </p>
          )}

          {result.resolvedPatient && (
            <button
              type="button"
              onClick={() => {
                const patient = patientFromRecall(result);
                if (patient) onOpenPatient(patient);
              }}
              className="group mt-5 flex w-full items-center gap-3 rounded-[1.15rem] border border-primary/20 bg-primary-soft px-3.5 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[0.9rem] border border-primary/20 bg-card text-primary">
                <UserRoundIcon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {result.resolvedPatient.full_name || "Patient chart"}
                </span>
                <span className="block text-xs text-muted-foreground">Open complete medical history</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          )}

          {/* Ambiguous name — the doctor disambiguates, the system never guesses. */}
          {result.candidates.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPickPatient(candidate.id)}
                  >
                    {candidate.full_name}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {result.encounters.length > 0 && (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <CalendarDaysIcon className="size-3.5 text-primary" aria-hidden />
                  Evidence trail
                </p>
                <span className="tnum text-xs text-muted-foreground">{result.encounters.length} source{result.encounters.length === 1 ? "" : "s"}</span>
              </div>
              <ol className="mt-2 grid gap-2 sm:grid-cols-2">
                {result.encounters.slice(0, EVIDENCE_LIMIT).map((encounter) => (
                  <li key={encounter.id} className="surface-inset rounded-[1rem] p-3 text-xs">
                    <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      {formatDayLong(encounter.occurred_at.slice(0, 10))}
                    </p>
                    <p className="mt-1.5 line-clamp-2 font-medium leading-5 text-foreground">
                      {encounter.diagnosis || "Diagnosis not recorded"}
                    </p>
                    {encounter.prescription.length > 0 && (
                      <p className="mt-1.5 line-clamp-2 leading-5 text-muted-foreground">
                        {encounter.prescription
                          .map((item) =>
                            [item.drug_name, item.strength, item.frequency]
                              .filter(Boolean)
                              .join(" "),
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* Confidence is stated as a word, not encoded as a colour: "low"
              has to be readable as low even where the tint is not. */}
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={result.confidence === "high" ? "default" : "secondary"}>
              <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
              {result.confidence} confidence
            </Badge>
            {/* This claimed "drawn from 9 recorded visits" above a list of four.
                In a panel whose whole purpose is that the doctor can check the
                answer against the evidence, five invisible sources is the one
                thing it must not do. */}
            <span>
              drawn from {result.encounters.length} recorded visit
              {result.encounters.length === 1 ? "" : "s"}
              {result.encounters.length > EVIDENCE_LIMIT
                ? ` · ${EVIDENCE_LIMIT} shown`
                : ""}
            </span>
          </p>
        </>
      )}
    </motion.section>
  );
}
