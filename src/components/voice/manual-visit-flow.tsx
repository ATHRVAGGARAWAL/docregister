"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRightIcon,
  FilePenLine,
  Loader2,
  PillIcon,
  SearchIcon,
  ToothIcon,
  UserPlus,
  UserRoundIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ToothFindingEditor } from "@/components/dental/tooth-finding-editor";
import { Select } from "@/components/ui/select";
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
import { VisitProgress } from "@/components/voice/visit-progress";
import { ReviewSheet } from "@/components/voice/review-sheet";
import {
  normalisePatientPhone,
  PATIENT_SEX_OPTIONS,
  patientPhoneError,
  type PatientMatch,
  type PatientSex,
  type ReviewDraft,
  type ReviewMedication,
  type ReviewToothFinding,
} from "@/lib/encounters/review";
import { extractFdiTeeth } from "@/lib/dental/tooth";
import { maskPhone } from "@/lib/format";
import type { CommitOutcome } from "@/lib/types";

export function ManualVisitFlow({
  open,
  initialPatient = null,
  onOpenChange,
  onCommitted,
  onScheduleFollowUp,
  onViewRegister,
  onStartNext,
  onKeepForLater,
  onDraftDiscarded,
}: {
  open: boolean;
  initialPatient?: PatientMatch | null;
  onOpenChange: (open: boolean) => void;
  onCommitted: (outcome: CommitOutcome) => void;
  onScheduleFollowUp?: (outcome: CommitOutcome) => void;
  onViewRegister?: () => void;
  onStartNext?: () => void;
  onKeepForLater?: () => void;
  onDraftDiscarded?: () => void;
}) {
  const [step, setStep] = useState<"patient" | "note">(
    initialPatient ? "note" : "patient",
  );
  const [patient, setPatient] = useState<PatientMatch | null>(initialPatient);
  const [newPatient, setNewPatient] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [name, setName] = useState(initialPatient?.full_name ?? "");
  const [phone, setPhone] = useState(initialPatient?.phone ?? "");
  const [sex, setSex] = useState<PatientSex | "">("");
  const [age, setAge] = useState(initialPatient?.age_years?.toString() ?? "");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [toothFindings, setToothFindings] = useState<ReviewToothFinding[]>([]);
  const [medications, setMedications] = useState<ReviewMedication[]>([]);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const dirty = Boolean(
    name !== (initialPatient?.full_name ?? "") ||
      diagnosis ||
      treatment ||
      toothFindings.length ||
      medications.length,
  );

  useEffect(() => {
    if (!open || patient || newPatient || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const response = await fetch(
          `/api/patients?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { patients: PatientMatch[] };
        if (!controller.signal.aborted) setMatches(body.patients.slice(0, 6));
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, patient, newPatient, query]);

  useEffect(() => {
    if (!open || !dirty || draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty, draft]);

  function close() {
    onOpenChange(false);
  }
  function requestClose() {
    if (submitting.current) return;
    if (
      dirty &&
      !window.confirm(
        "Discard this unfinished visit? Your notes have not been saved.",
      )
    )
      return;
    close();
  }
  function choosePatient(match: PatientMatch) {
    setPatient(match);
    setName(match.full_name);
    setPhone(match.phone ?? "");
    setAge(match.age_years?.toString() ?? "");
    setSex("");
    setFailure(null);
  }
  function changePatient() {
    setPatient(null);
    setNewPatient(false);
    setName("");
    setPhone("");
    setAge("");
    setSex("");
    setQuery("");
    setMatches([]);
    setSearching(false);
    setSearchError(false);
    setFailure(null);
    setStep("patient");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim() || (!patient && !newPatient)) {
      setFailure("Select an existing patient or enter a new patient's name.");
      return;
    }
    if (
      age.trim() &&
      (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 130)
    ) {
      setFailure(
        "Age must be a whole number between 0 and 130, or left blank.",
      );
      return;
    }
    const phoneIssue = patientPhoneError(phone);
    if (phoneIssue) {
      setFailure(phoneIssue);
      return;
    }
    setFailure(null);
    if (step === "patient") {
      setStep("note");
      return;
    }
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
      setFailure(
        "Add a drug name to each medicine, or remove the incomplete row.",
      );
      return;
    }
    submitting.current = true;
    setSaving(true);
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
          prescription: medications
            .map(cleanMedication)
            .filter((medicine) => medicine.drug_name.length > 0),
          tooth_findings: toothFindings,
        }),
      });
      if (!response.ok)
        throw new Error(
          await responseMessage(
            response,
            "Could not create the draft. Your notes are still here.",
          ),
        );
      setDraft((await response.json()) as ReviewDraft);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Could not create the draft.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (!open) return null;
  if (draft)
    return (
      <ReviewSheet
        draft={draft}
        initialPatient={patient}
        actionError={failure}
        onCommitted={onCommitted}
        onDismissAfterCommit={close}
        onScheduleFollowUp={(outcome) => {
          close();
          onScheduleFollowUp?.(outcome);
        }}
        onViewRegister={() => {
          close();
          onViewRegister?.();
        }}
        onStartNext={() => {
          close();
          onStartNext?.();
        }}
        onDiscard={() => {
          if (submitting.current) return;
          submitting.current = true;
          void fetch(`/api/drafts/${draft.encounterId}`, { method: "DELETE" })
            .then(async (response) => {
              if (!response.ok)
                throw new Error(
                  await responseMessage(
                    response,
                    "Could not discard the draft. Please retry.",
                  ),
                );
              close();
              onDraftDiscarded?.();
            })
            .catch((error: unknown) =>
              setFailure(
                error instanceof Error
                  ? error.message
                  : "Could not discard the draft.",
              ),
            )
            .finally(() => {
              submitting.current = false;
            });
        }}
        onKeepForLater={() => {
          close();
          onKeepForLater?.();
        }}
      />
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <SheetContent
        className="overflow-hidden sm:max-w-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b border-border px-5 pb-5 pt-5 sm:px-6">
          <SheetTitle className="text-lg">New visit</SheetTitle>
          <SheetDescription>
            {step === "patient"
              ? "Find an existing patient or add someone new."
              : "Record the consultation. You can check everything before confirming."}
          </SheetDescription>
          <VisitProgress step={step === "patient" ? 1 : 2} />
        </SheetHeader>
        <form onSubmit={submit} className="contents">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
            {step === "patient" ? (
              <>
                {patient ? (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft p-4">
                    <UserRoundIcon
                      className="size-5 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{patient.full_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Existing patient ·{" "}
                        {maskPhone(patient.phone) ?? "No phone recorded"}
                        {age ? ` · ${age} years` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={changePatient}
                    >
                      Change
                    </Button>
                  </div>
                ) : newPatient ? (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">
                        New patient details
                      </h2>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={changePatient}
                      >
                        Search existing patients
                      </Button>
                    </div>
                    <FormField
                      label="Patient name"
                      htmlFor="manual-patient-name"
                      required
                    >
                      <Input
                        id="manual-patient-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoFocus
                        required
                        maxLength={160}
                        autoComplete="off"
                      />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label="Phone (optional)"
                        htmlFor="manual-patient-phone"
                      >
                        <Input
                          id="manual-patient-phone"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="Helps identify returning patients"
                        />
                      </FormField>
                      <FormField
                        label="Age (optional)"
                        htmlFor="manual-patient-age"
                      >
                        <Input
                          id="manual-patient-age"
                          value={age}
                          onChange={(event) => setAge(event.target.value)}
                          inputMode="numeric"
                          type="number"
                          min={0}
                          max={130}
                          step={1}
                        />
                      </FormField>
                    </div>
                    <FormField
                      label="Sex (optional)"
                      htmlFor="manual-patient-sex"
                    >
                      <Select
                        id="manual-patient-sex"
                        value={sex}
                        onChange={(event) =>
                          setSex(event.target.value as PatientSex | "")
                        }
                      >
                        <option value="">Not stated</option>
                        {PATIENT_SEX_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </section>
                ) : (
                  <section className="space-y-4">
                    <FormField
                      label="Find a patient"
                      htmlFor="visit-patient-search"
                    >
                      <div className="relative">
                        <SearchIcon
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          id="visit-patient-search"
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setMatches([]);
                            setSearchError(false);
                            setSearching(event.target.value.trim().length >= 2);
                          }}
                          placeholder="Search by name or phone number"
                          className="h-11 pl-10"
                          autoFocus
                          autoComplete="off"
                        />
                      </div>
                    </FormField>
                    {searching && query.trim().length >= 2 && (
                      <p
                        role="status"
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Loader2
                          className="size-3.5 animate-spin"
                          aria-hidden
                        />
                        Searching patients…
                      </p>
                    )}
                    {searchError && (
                      <p role="alert" className="text-sm text-destructive">
                        Patient search is unavailable. Try searching again
                        before creating a new chart.
                      </p>
                    )}
                    {matches.length > 0 && (
                      <ul className="overflow-hidden rounded-lg border border-border">
                        {matches.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              className="flex min-h-16 w-full items-center gap-3 border-b border-border p-3 text-left hover:bg-secondary"
                              onClick={() => choosePatient(match)}
                            >
                              <UserRoundIcon
                                className="size-4 text-muted-foreground"
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1">
                                <strong className="block text-sm font-medium">
                                  {match.full_name}
                                </strong>
                                <small className="mt-1 block text-xs text-muted-foreground">
                                  {maskPhone(match.phone) ?? "No phone"}
                                  {match.age_years == null
                                    ? ""
                                    : ` · ${match.age_years} years`}
                                </small>
                              </span>
                              <ChevronRightIcon
                                className="size-4"
                                aria-hidden
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!searching &&
                      !searchError &&
                      query.trim().length >= 2 &&
                      matches.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No matching patients. Try another spelling or add a
                          new patient.
                        </p>
                      )}
                    <div className="border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setNewPatient(true);
                          setName(/\d/.test(query) ? "" : query.trim());
                          setPhone(/^[+\d\s-]+$/.test(query) ? query : "");
                          setSearching(false);
                        }}
                      >
                        <UserPlus aria-hidden />
                        New patient
                      </Button>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        The patient’s chart is created when you confirm their
                        first visit.
                      </p>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
                  <UserRoundIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {patient ? "Existing patient" : "New patient"}
                      {age ? ` · ${age} years` : ""}
                      {phone ? ` · ${maskPhone(phone)}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStep("patient");
                      setFailure(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
                <FormField
                  label="Diagnosis / assessment"
                  htmlFor="manual-diagnosis"
                >
                  <Textarea
                    key="diagnosis"
                    id="manual-diagnosis"
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                    rows={3}
                    placeholder="Presenting complaint and clinical assessment"
                    autoFocus
                    maxLength={2000}
                  />
                </FormField>
                <FormField label="Treatment / plan" htmlFor="manual-treatment">
                  <Textarea
                    id="manual-treatment"
                    value={treatment}
                    onChange={(event) => setTreatment(event.target.value)}
                    rows={3}
                    placeholder="Care provided, advice and next steps"
                    maxLength={2000}
                  />
                </FormField>
                <details className="visit-optional">
                  <summary>
                    <ToothIcon aria-hidden />
                    Dental chart
                    <small>
                      {toothFindings.length
                        ? `${toothFindings.length} findings`
                        : "Optional"}
                    </small>
                    <ChevronRightIcon aria-hidden />
                  </summary>
                  <div>
                    <ToothFindingEditor
                      value={toothFindings}
                      onChange={setToothFindings}
                      relatedTeeth={[
                        ...extractFdiTeeth(diagnosis),
                        ...extractFdiTeeth(treatment),
                      ]}
                      title="Tooth findings"
                      description="Select a tooth to record a finding."
                    />
                  </div>
                </details>
                <details className="visit-optional">
                  <summary>
                    <PillIcon aria-hidden />
                    Prescription
                    <small>
                      {medications.length
                        ? `${medications.length} medicines`
                        : "Optional"}
                    </small>
                    <ChevronRightIcon aria-hidden />
                  </summary>
                  <div>
                    <MedicationEditor
                      value={medications}
                      onChange={setMedications}
                    />
                  </div>
                </details>
              </>
            )}
          </div>
          <SheetFooter className="flex-col items-stretch gap-3 px-5 sm:px-6">
            {failure && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {failure}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={
                  step === "patient"
                    ? requestClose
                    : () => {
                        setStep("patient");
                        setFailure(null);
                      }
                }
                disabled={saving}
              >
                {step === "patient" ? "Cancel" : "Back"}
              </Button>
              <Button
                type="submit"
                disabled={saving || (!patient && !newPatient)}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : step === "patient" ? (
                  <ArrowRight aria-hidden />
                ) : (
                  <FilePenLine aria-hidden />
                )}
                {saving
                  ? "Preparing review…"
                  : step === "patient"
                    ? "Continue to note"
                    : "Review visit"}
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
      <Label htmlFor={htmlFor} className="mb-1.5 text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
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

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function responseMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
