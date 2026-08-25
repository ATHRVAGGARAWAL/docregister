"use client";

import { motion } from "motion/react";
import { ChevronRightIcon, Loader2, Quote, UserRoundIcon, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatDayLong, formatINR } from "@/lib/format";

export interface RecallResult {
  answer: string;
  confidence: "high" | "medium" | "low";
  caveat: string | null;
  encounters: {
    id: string;
    occurred_at: string;
    diagnosis: string | null;
    fees_inr: number | null;
    patient_name: string;
    prescription: { drug_name: string; strength: string | null; frequency: string | null }[];
  }[];
  candidates: { id: string; full_name: string }[];
  resolvedPatient: { id: string; full_name: string | null } | null;
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
}: {
  question: string;
  result: RecallResult | null;
  loading: boolean;
  onDismiss: () => void;
  onPickPatient: (patientId: string) => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="slip p-4 sm:p-5"
      aria-live="polite"
    >
      <header className="flex items-start justify-between gap-3">
        <p className="well text-muted-foreground flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-sm">
          <Quote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{question}</span>
        </p>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} className="shrink-0">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Dismiss answer</span>
        </Button>
      </header>

      {loading || !result ? (
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Looking through your register…
        </p>
      ) : (
        <>
          <p className="text-foreground mt-4 text-[15px] leading-relaxed text-balance">
            {result.answer}
          </p>

          {result.caveat && (
            <p className="text-money mt-2 text-xs">{result.caveat}</p>
          )}

          {result.resolvedPatient && (
            <button
              type="button"
              onClick={() =>
                onOpenPatient({
                  id: result.resolvedPatient!.id,
                  full_name: result.resolvedPatient!.full_name || "Patient",
                  phone: null,
                  age_years: null,
                  last_visit: result.encounters[0]?.occurred_at ?? null,
                  visit_count: result.encounters.length,
                })
              }
              className="mt-4 flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/8 px-3.5 py-3 text-left transition-colors hover:bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                <UserRoundIcon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {result.resolvedPatient.full_name || "Patient chart"}
                </span>
                <span className="block text-xs text-muted-foreground">Open complete medical history</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-primary" aria-hidden />
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
            <ol className="border-border divide-border mt-4 divide-y border-t">
              {result.encounters.slice(0, EVIDENCE_LIMIT).map((encounter) => (
                <li key={encounter.id} className="py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">
                      {formatDayLong(encounter.occurred_at.slice(0, 10))}
                      {encounter.diagnosis && (
                        <span className="text-foreground"> · {encounter.diagnosis}</span>
                      )}
                    </span>
                    {encounter.fees_inr !== null && (
                      <span className="text-money tnum shrink-0">
                        {formatINR(encounter.fees_inr)}
                      </span>
                    )}
                  </div>
                  {encounter.prescription.length > 0 && (
                    <p className="text-muted-foreground mt-0.5">
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
          )}

          {/* Confidence is stated as a word, not encoded as a colour: "low"
              has to be readable as low even where the tint is not. */}
          <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <Badge variant={result.confidence === "high" ? "default" : "secondary"}>
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
