"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRightIcon,
  BookOpenCheckIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@/components/icons";

import { RecallPanel, type RecallResult } from "@/components/dashboard/recall-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";

/**
 * Prompts to get a doctor started, built from names that are actually in their
 * register.
 *
 * These were previously hardcoded to "Sunita" and "Amit". Every doctor who is
 * not the demo clinic tapped one and got "No patient named Sunita is in your
 * register" — a feature introducing itself by failing. A suggestion has to be
 * answerable or it should not carry a name at all, so the name-bearing prompts
 * only appear once there is a real name to put in them.
 */
function buildSuggestions(names: string[]): string[] {
  const base = ["What did I prescribe last time?"];
  const [first, second] = names;
  if (first) base.push(`Show recent visits for ${first}`);
  if (second) base.push(`When did I last see ${second}?`);
  // Nothing in the register yet: keep a third prompt that needs no name, so the
  // row does not look half-empty on a new account.
  if (base.length === 1) base.push("Which patients did I see this week?");
  return base;
}

export function RecallWorkspace({
  question,
  result,
  loading,
  onAsk,
  onDismiss,
  onPickPatient,
  recentPatientNames,
  onOpenPatient,
  onRecordAsVisit,
}: {
  question: string | null;
  result: RecallResult | null;
  loading: boolean;
  onAsk: (question: string) => void;
  onDismiss: () => void;
  onPickPatient: (patientId: string) => void;
  /** Distinct patient names from the register, most recent first. */
  recentPatientNames: string[];
  onOpenPatient: (patient: PatientMatch) => void;
  /** Set only while the question on screen was spoken rather than typed. */
  onRecordAsVisit?: () => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onAsk(draft.trim());
  }

  return (
    <div className="space-y-5 sm:space-y-7">
      <section>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="grid size-6 place-items-center rounded-full border border-primary/20 bg-primary-soft">
            <SparklesIcon className="size-3.5" aria-hidden />
          </span>
          Evidence-grounded recall
        </p>
        <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.04em] sm:mt-3 sm:text-4xl">
          Patient recall
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ask naturally. Every answer stays tethered to the visits, dates, and medicines in your register.
        </p>
      </section>

      <Card className="surface-elevated relative gap-0 overflow-hidden rounded-[1.65rem] border-border bg-card py-0">
        <CardContent className="relative p-3 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-semibold text-foreground">Search the clinical memory</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Names, prescriptions, dates, and follow-ups</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-money/30 bg-money-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-money sm:inline-flex">
              <span className="size-1.5 rounded-full bg-money" aria-hidden />
              Private
            </span>
          </div>
          <form onSubmit={submit} className="surface-inset flex flex-col gap-2 rounded-[1.2rem] p-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="What did I prescribe Sunita last time?"
                aria-label="Ask about patient history"
                className="h-11 rounded-[0.9rem] border-0 bg-transparent pl-11 shadow-none focus-visible:ring-0 sm:h-12"
              />
            </div>
            <Button type="submit" size="lg" disabled={loading} className="h-11 rounded-[0.9rem] px-5 sm:h-12">
              Search history <ArrowUpRightIcon className="size-4" aria-hidden />
            </Button>
          </form>
          <div className="no-scrollbar -mx-1 mt-3 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Try</span>
            {buildSuggestions(recentPatientNames).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                // `/api/recall` is a paid model call metered at 60/hour. Without
                // this, three impatient taps are three unsequenced POSTs racing
                // to render into the same panel, and the doctor spends three
                // units of their hourly ceiling to read one answer.
                disabled={loading}
                onClick={() => {
                  setDraft(suggestion);
                  onAsk(suggestion);
                }}
                className="shrink-0 touch-manipulation rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {question ? (
        <RecallPanel
          question={question}
          result={result}
          loading={loading}
          onDismiss={onDismiss}
          onPickPatient={onPickPatient}
          onOpenPatient={onOpenPatient}
          onRecordAsVisit={onRecordAsVisit}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="surface-card group gap-0 rounded-[1.4rem] border-border bg-card py-0 transition-colors hover:bg-card">
            <CardContent className="flex gap-4 p-5 sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-[1rem] border border-primary/20 bg-primary-soft text-primary">
                <BookOpenCheckIcon className="size-5" aria-hidden />
              </span>
              <div>
              <h2 className="text-sm font-semibold tracking-[-0.01em]">Answers with visible evidence</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Recall always shows the verified visits used for the answer, including dates,
                diagnosis and medicines.
              </p>
              </div>
            </CardContent>
          </Card>
          <Alert variant="success" role="note" className="surface-card h-full rounded-[1.4rem] border-money/30 bg-money-soft p-5 sm:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-[1rem] border border-money/30 bg-card text-money">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </span>
            <div>
            <AlertTitle className="text-sm">Clinic-scoped search</AlertTitle>
            <AlertDescription className="mt-1.5 text-sm leading-6">
              Search is restricted by the same database policies as the register. Another clinic&rsquo;s
              patients cannot appear here.
            </AlertDescription>
            </div>
          </Alert>
        </div>
      )}
    </div>
  );
}
