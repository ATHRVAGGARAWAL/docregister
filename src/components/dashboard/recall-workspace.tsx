"use client";

import { FormEvent, useState } from "react";
import { BookOpenCheckIcon, SearchIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

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
}: {
  question: string | null;
  result: RecallResult | null;
  loading: boolean;
  onAsk: (question: string) => void;
  onDismiss: () => void;
  onPickPatient: (patientId: string) => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onAsk(draft.trim());
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <SparklesIcon className="size-3.5" aria-hidden />
          Grounded only in your register
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Patient recall
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ask a natural-language question and verify the answer against the recorded visits shown
          underneath.
        </p>
      </section>

      <Card className="gap-0 py-0">
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="What did I prescribe Sunita last time?"
                aria-label="Ask about patient history"
                className="h-12 rounded-xl pl-11"
              />
            </div>
            <Button type="submit" size="lg" disabled={loading} className="h-12">
              Search history
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setDraft(suggestion);
                  onAsk(suggestion);
                }}
                className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:bg-primary/8 hover:text-primary"
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
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="gap-0 py-0">
            <CardContent className="p-5">
              <BookOpenCheckIcon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-4 text-base font-semibold">Answers with evidence</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Recall always shows the verified visits used for the answer, including dates,
                diagnosis and medicines.
              </p>
            </CardContent>
          </Card>
          <Alert variant="success" role="note" className="h-full p-5">
            <ShieldCheckIcon className="mt-0.5 size-5" aria-hidden />
            <AlertTitle>Clinic-scoped search</AlertTitle>
            <AlertDescription className="mt-1 text-sm leading-6">
              Search is restricted by the same database policies as the register. Another clinic&rsquo;s
              patients cannot appear here.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
