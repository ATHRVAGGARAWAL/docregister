"use client";

import { useState } from "react";
import { ArrowRight, FilePenLine, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MedicationEditor } from "@/components/voice/medication-editor";
import { ReviewSheet } from "@/components/voice/review-sheet";
import {
  normalisePatientPhone,
  PATIENT_SEX_OPTIONS,
  patientPhoneError,
  type PatientSex,
  type ReviewDraft,
  type ReviewMedication,
} from "@/lib/encounters/review";

const FIRST_MEDICATION: ReviewMedication = {
  drug_name: "",
  strength: null,
  form: null,
  route: null,
  frequency_spoken: null,
  duration: null,
  instructions: null,
};

/**
 * Manual fallback for a noisy room, blocked microphone, or network-constrained
 * device. It creates the same draft row as voice capture and then hands that
 * draft to ReviewSheet; the commit path is therefore identical.
 */
export function ManualVisitFlow({
  open,
  onOpenChange,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<PatientSex | "">("");
  const [age, setAge] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [medications, setMedications] = useState<ReviewMedication[]>([
    { ...FIRST_MEDICATION },
  ]);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setSex("");
    setAge("");
    setDiagnosis("");
    setTreatment("");
    setMedications([{ ...FIRST_MEDICATION }]);
    setDraft(null);
    setSaving(false);
    setFailure(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function prepareReview(event: React.FormEvent) {
    event.preventDefault();
    const phoneIssue = patientPhoneError(phone);

    if (!name.trim()) {
      setFailure("A patient name is required.");
      return;
    }
    if (!isNumericField(age) || (age.trim() && Number(age) > 130)) {
      setFailure("Age must be a number between 0 and 130, or left blank.");
      return;
    }
    if (phoneIssue) {
      setFailure(phoneIssue);
      return;
    }

    const prescription = medications
      .map(cleanMedication)
      .filter((medicine) => medicine.drug_name.length > 0);

    const incomplete = medications.some(
      (medicine) =>
        !medicine.drug_name.trim() &&
        [
          medicine.strength,
          medicine.form,
          medicine.route,
          medicine.frequency_spoken,
          medicine.duration,
          medicine.instructions,
        ].some((part) => Boolean(part?.trim())),
    );
    if (incomplete) {
      setFailure("Add a drug name to each medicine, or remove the incomplete row.");
      return;
    }

    setSaving(true);
    setFailure(null);
    try {
      const response = await fetch("/api/encounters/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name.trim(),
          phone: normalisePatientPhone(phone),
          sex: sex || null,
          age_years: parseNumber(age),
          diagnosis: diagnosis.trim() || null,
          treatment: treatment.trim() || null,
          prescription,
        }),
      });

      if (!response.ok) {
        throw new Error(await responseMessage(response, "Could not create the draft."));
      }
      setDraft((await response.json()) as ReviewDraft);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not create the draft.");
    } finally {
      setSaving(false);
    }
  }

  if (draft) {
    return (
      <ReviewSheet
        draft={draft}
        onCommitted={() => {
          close();
          onCommitted();
        }}
        onDiscard={() => {
          void fetch(`/api/encounters/${draft.encounterId}`, { method: "DELETE" });
          close();
        }}
      />
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent className="glass-strong overflow-hidden border-white/10 bg-card/90 sm:max-w-2xl">
        <SheetHeader className="relative border-b border-white/8 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_14px_30px_-18px_var(--primary)]">
              <FilePenLine className="size-4" aria-hidden />
            </span>
            <div>
              <SheetTitle className="text-lg font-semibold tracking-[-0.025em]">
                Enter visit manually
              </SheetTitle>
              <SheetDescription className="mt-1 max-w-md leading-5">
                Capture the essentials now. The same clinical review step follows before anything is saved.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={prepareReview} className="contents">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <section className="glass-inset rounded-2xl border-white/8 bg-background/20 p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="tnum grid size-7 place-items-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">01</span>
                <div>
                  <h3 className="text-sm font-semibold tracking-[-0.015em]">Patient identity</h3>
                  <p className="text-xs text-muted-foreground">Enough detail to find or create the correct chart.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Patient name" htmlFor="manual-patient-name" required>
                  <Input
                    id="manual-patient-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="off"
                    autoFocus
                    className="h-11 rounded-xl bg-background/30"
                  />
                </FormField>
                <FormField label="Phone" htmlFor="manual-patient-phone">
                  <Input
                    id="manual-patient-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Optional, helps find the right chart"
                    className="h-11 rounded-xl bg-background/30"
                  />
                </FormField>
                <FormField label="Age" htmlFor="manual-patient-age">
                  <Input
                    id="manual-patient-age"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    inputMode="numeric"
                    className="tnum h-11 rounded-xl bg-background/30"
                  />
                </FormField>
                <FormField label="Sex" htmlFor="manual-patient-sex">
                  <select
                    id="manual-patient-sex"
                    value={sex}
                    onChange={(event) => setSex(event.target.value as PatientSex | "")}
                    className="glass-inset h-11 w-full rounded-xl border-white/8 bg-background/30 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
                  >
                    <option value="">Not stated</option>
                    {PATIENT_SEX_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className="glass-inset rounded-2xl border-white/8 bg-background/20 p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="tnum grid size-7 place-items-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">02</span>
                <div>
                  <h3 className="text-sm font-semibold tracking-[-0.015em]">Clinical note</h3>
                  <p className="text-xs text-muted-foreground">Summarise the assessment and care plan.</p>
                </div>
              </div>
              <div className="space-y-4">
                <FormField label="Diagnosis" htmlFor="manual-diagnosis">
                  <Textarea
                    id="manual-diagnosis"
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                    rows={2}
                    className="resize-none rounded-xl bg-background/30"
                  />
                </FormField>

                <FormField label="Treatment plan" htmlFor="manual-treatment">
                  <Textarea
                    id="manual-treatment"
                    value={treatment}
                    onChange={(event) => setTreatment(event.target.value)}
                    rows={3}
                    className="resize-none rounded-xl bg-background/30"
                  />
                </FormField>
              </div>
            </section>

            <section className="glass-inset rounded-2xl border-white/8 bg-background/20 p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="tnum grid size-7 place-items-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">03</span>
                <div>
                  <h3 className="text-sm font-semibold tracking-[-0.015em]">Prescription</h3>
                  <p className="text-xs text-muted-foreground">Add only the medicines discussed in this visit.</p>
                </div>
              </div>
              <MedicationEditor value={medications} onChange={setMedications} />
            </section>
          </div>

          <SheetFooter className="flex-col items-stretch gap-2 border-white/8 bg-background/20 px-4 sm:px-6">
            {failure && (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                {failure}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" size="lg" onClick={close} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" size="lg" className="flex-1 rounded-xl" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="size-4" aria-hidden />
                )}
                Review visit
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FormField({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        htmlFor={htmlFor}
        className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      >
        {label}
        {required && <span className="ml-1 text-primary">required</span>}
      </Label>
      {children}
    </div>
  );
}

function cleanMedication(medicine: ReviewMedication): ReviewMedication {
  return {
    drug_name: medicine.drug_name.trim(),
    strength: medicine.strength?.trim() || null,
    form: medicine.form?.trim() || null,
    route: medicine.route?.trim() || null,
    frequency_spoken: medicine.frequency_spoken?.trim() || null,
    duration: medicine.duration?.trim() || null,
    instructions: medicine.instructions?.trim() || null,
  };
}

function isNumericField(value: string): boolean {
  return value.trim() === "" || Number.isFinite(Number(value));
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
