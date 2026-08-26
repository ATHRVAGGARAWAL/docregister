"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRightIcon,
  BookOpenCheckIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { RecallPanel, type RecallResult } from "@/components/dashboard/recall-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";

const suggestions = [
  "What did I prescribe last time?",
  "Show recent visits for Sunita",
  "When was Amit's last follow-up?",
];

export function RecallWorkspace({
  question,
  result,
  loading,
  onAsk,
  onDismiss,
  onPickPatient,
  onOpenPatient,
  onRecordAsVisit,
}: {
  question: string | null;
  result: RecallResult | null;
  loading: boolean;
  onAsk: (question: string) => void;
  onDismiss: () => void;
  onPickPatient: (patientId: string) => void;
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
    <div className="space-y-7">
      <section>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="grid size-6 place-items-center rounded-full border border-primary/20 bg-primary/10">
            <SparklesIcon className="size-3.5" aria-hidden />
          </span>
          Evidence-grounded recall
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Patient recall
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ask naturally. Every answer stays tethered to the visits, dates, and medicines in your register.
        </p>
      </section>

      <Card className="glass-strong relative gap-0 overflow-hidden rounded-[1.65rem] border-white/10 bg-card/55 py-0 shadow-[0_30px_90px_-48px_color-mix(in_oklab,var(--primary)_45%,transparent)] backdrop-blur-2xl">
        <div className="ambient-orb pointer-events-none absolute -left-20 -top-24 size-52 opacity-50" aria-hidden />
        <div className="ambient-orb pointer-events-none -bottom-24 right-4 size-48 opacity-30 [animation-delay:-5s]" aria-hidden />
        <CardContent className="relative p-4 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-semibold text-foreground">Search the clinical memory</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Names, prescriptions, dates, and follow-ups</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-500 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" aria-hidden />
              Private
            </span>
          </div>
          <form onSubmit={submit} className="glass-inset flex flex-col gap-2 rounded-[1.2rem] p-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="What did I prescribe Sunita last time?"
                aria-label="Ask about patient history"
                className="h-12 rounded-[0.9rem] border-0 bg-transparent pl-11 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button type="submit" size="lg" disabled={loading} className="h-12 rounded-[0.9rem] px-5 shadow-[0_12px_28px_-14px_var(--primary)]">
              Search history <ArrowUpRightIcon className="size-4" aria-hidden />
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Try</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setDraft(suggestion);
                  onAsk(suggestion);
                }}
                className="touch-manipulation rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
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
          <Card className="glass-card group gap-0 rounded-[1.4rem] border-white/10 bg-card/45 py-0 transition-colors hover:bg-card/65">
            <CardContent className="flex gap-4 p-5 sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-[1rem] border border-primary/20 bg-primary/10 text-primary">
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
          <Alert variant="success" role="note" className="glass-card h-full rounded-[1.4rem] border-emerald-400/15 bg-emerald-400/6 p-5 sm:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-[1rem] border border-emerald-400/20 bg-emerald-400/10 text-emerald-500">
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
