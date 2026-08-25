"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ClipboardListIcon,
  IndianRupeeIcon,
  LoaderCircleIcon,
  PencilIcon,
  PillIcon,
  SaveIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock, formatINR, maskPhone } from "@/lib/format";
import type { PatientHistoryEncounter, PatientHistoryPayload } from "@/lib/types";

export function PatientHistorySheet({
  patient,
  open,
  onOpenChange,
  onUsePatient,
  onPatientUpdated,
}: {
  patient: PatientMatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUsePatient?: (patient: PatientMatch) => void;
  onPatientUpdated?: (patient: PatientHistoryPayload["patient"]) => void;
}) {
  const [request, setRequest] = useState<{
    patientId: string;
    history: PatientHistoryPayload | null;
    error: string | null;
  } | null>(null);
  const [editForm, setEditForm] = useState<PatientDetailsForm | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const patientId = patient?.id;

  useEffect(() => {
    if (!open || !patientId) return;

    const controller = new AbortController();

    fetch(`/api/patients/${encodeURIComponent(patientId)}/history`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Could not open this patient chart.");
        setRequest({ patientId, history: payload as PatientHistoryPayload, error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setRequest({
          patientId,
          history: null,
          error: cause instanceof Error ? cause.message : "Could not open this patient chart.",
        });
      });

    return () => controller.abort();
  }, [open, patientId]);

  const currentRequest = request?.patientId === patientId ? request : null;
  const history = currentRequest?.history ?? null;
  const error = currentRequest?.error ?? null;
  const loading = open && Boolean(patientId) && currentRequest === null;

  const totals = useMemo(() => {
    const encounters = history?.encounters ?? [];
    return {
      fees: encounters.reduce((sum, encounter) => sum + (encounter.fees_inr ?? 0), 0),
      diagnoses: new Set(
        encounters
          .map((encounter) => encounter.diagnosis?.trim())
          .filter((diagnosis): diagnosis is string => Boolean(diagnosis)),
      ).size,
    };
  }, [history]);

  function startEditing() {
    if (!history) return;
    setEditError(null);
    setEditForm({
      fullName: history.patient.full_name,
      phone: history.patient.phone ?? "",
      ageYears: history.patient.age_years?.toString() ?? "",
      sex: history.patient.sex ?? "",
      abhaId: history.patient.abha_id ?? "",
      notes: history.patient.notes ?? "",
    });
  }

  async function savePatientDetails() {
    if (!history || !editForm) return;
    if (!editForm.fullName.trim()) {
      setEditError("Patient name is required.");
      return;
    }

    setSavingDetails(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(history.patient.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName,
          phone: editForm.phone,
          ageYears: editForm.ageYears,
          sex: editForm.sex,
          abhaId: editForm.abhaId,
          notes: editForm.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Could not update this patient chart.");

      const updatedPatient = payload as PatientHistoryPayload["patient"];
      setRequest((current) =>
        current?.patientId === updatedPatient.id && current.history
          ? {
              ...current,
              history: { ...current.history, patient: updatedPatient },
              error: null,
            }
          : current,
      );
      onPatientUpdated?.(updatedPatient);
      setEditForm(null);
    } catch (cause) {
      setEditError(
        cause instanceof Error ? cause.message : "Could not update this patient chart.",
      );
    } finally {
      setSavingDetails(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:h-[88dvh] sm:max-h-[88dvh] sm:max-w-5xl">
        <SheetHeader className="border-b border-border pr-14 sm:px-7 sm:pt-6 sm:pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRoundIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">
                {history?.patient.full_name ?? patient?.full_name ?? "Patient chart"}
              </SheetTitle>
              <SheetDescription>
                Review the full history or correct the patient&rsquo;s master details. The current
                visit draft stays unchanged.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-secondary/25 px-5 py-5 sm:px-7">
          {loading && (
            <div className="grid min-h-72 place-items-center rounded-xl border border-border bg-card">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
                Opening patient chart…
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <ShieldCheckIcon className="mt-0.5 size-4" aria-hidden />
              <AlertTitle>Couldn’t open the chart</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {history && (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  icon={ClipboardListIcon}
                  label="Recorded visits"
                  value={String(history.encounters.length)}
                />
                <SummaryCard
                  icon={CalendarDaysIcon}
                  label="Last seen"
                  value={
                    history.encounters[0]
                      ? formatPatientDate(history.encounters[0].occurred_at)
                      : "No visits"
                  }
                />
                <SummaryCard
                  icon={IndianRupeeIcon}
                  label="Recorded fees"
                  value={formatINR(totals.fees)}
                />
              </section>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Medical timeline
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">All visits</h2>
                  </div>

                  {history.encounters.length === 0 ? (
                    <Card className="gap-0 py-0">
                      <CardContent className="grid min-h-44 place-items-center p-6 text-center">
                        <div>
                          <ClipboardListIcon className="mx-auto size-6 text-muted-foreground" aria-hidden />
                          <p className="mt-3 text-sm font-medium">No confirmed visits yet</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            This patient chart exists, but has no saved medical history.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <ol className="space-y-3">
                      {history.encounters.map((encounter) => (
                        <VisitCard key={encounter.id} encounter={encounter} />
                      ))}
                    </ol>
                  )}
                </section>

                <aside className="space-y-3 lg:sticky lg:top-0">
                  <Card className="gap-0 py-0">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Patient details
                        </p>
                        {!editForm && (
                          <Button variant="ghost" size="sm" onClick={startEditing}>
                            <PencilIcon className="size-3.5" aria-hidden />
                            Edit
                          </Button>
                        )}
                      </div>

                      {editForm ? (
                        <div className="mt-4 space-y-3">
                          <PatientInput
                            label="Full name"
                            value={editForm.fullName}
                            onChange={(value) => setEditForm({ ...editForm, fullName: value })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <PatientInput
                              label="Age"
                              value={editForm.ageYears}
                              inputMode="numeric"
                              onChange={(value) => setEditForm({ ...editForm, ageYears: value })}
                            />
                            <PatientInput
                              label="Sex"
                              value={editForm.sex}
                              onChange={(value) => setEditForm({ ...editForm, sex: value })}
                            />
                          </div>
                          <PatientInput
                            label="Phone"
                            value={editForm.phone}
                            inputMode="tel"
                            onChange={(value) => setEditForm({ ...editForm, phone: value })}
                          />
                          <PatientInput
                            label="ABHA ID"
                            value={editForm.abhaId}
                            onChange={(value) => setEditForm({ ...editForm, abhaId: value })}
                          />
                          <div className="space-y-1.5">
                            <Label htmlFor="patient-notes">Notes</Label>
                            <Textarea
                              id="patient-notes"
                              value={editForm.notes}
                              onChange={(event) =>
                                setEditForm({ ...editForm, notes: event.target.value })
                              }
                              rows={4}
                              maxLength={2_000}
                              placeholder="Allergies, long-term conditions, or other chart notes"
                              className="resize-none"
                            />
                          </div>

                          {editError && (
                            <p role="alert" className="text-xs text-destructive">
                              {editError}
                            </p>
                          )}

                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditForm(null);
                                setEditError(null);
                              }}
                              disabled={savingDetails}
                              className="flex-1"
                            >
                              <XIcon aria-hidden />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void savePatientDetails()}
                              disabled={savingDetails || !editForm.fullName.trim()}
                              className="flex-1"
                            >
                              {savingDetails ? (
                                <LoaderCircleIcon className="animate-spin" aria-hidden />
                              ) : (
                                <SaveIcon aria-hidden />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <dl className="mt-4 space-y-3 text-sm">
                          <Detail label="Age" value={history.patient.age_years == null ? "Not recorded" : `${history.patient.age_years} years`} />
                          <Detail label="Sex" value={history.patient.sex || "Not recorded"} />
                          <Detail label="Phone" value={maskPhone(history.patient.phone) || "Not recorded"} />
                          <Detail label="ABHA ID" value={history.patient.abha_id || "Not recorded"} />
                          <Detail label="First recorded" value={formatPatientDate(history.patient.first_seen_at)} />
                          <Detail label="Diagnoses on file" value={String(totals.diagnoses)} />
                        </dl>
                      )}
                    </CardContent>
                  </Card>

                  {!editForm && history.patient.notes && (
                    <Alert variant="default" role="note">
                      <StethoscopeIcon className="mt-0.5 size-4 text-primary" aria-hidden />
                      <AlertTitle>Patient note</AlertTitle>
                      <AlertDescription className="whitespace-pre-wrap">
                        {history.patient.notes}
                      </AlertDescription>
                    </Alert>
                  )}
                </aside>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="sm:px-7">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Back to review
          </Button>
          {patient && onUsePatient && (
            <Button onClick={() => onUsePatient(patient)} className="flex-1 sm:flex-none">
              <CheckIcon aria-hidden />
              Use this patient
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardListIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="tnum mt-0.5 truncate text-base font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function VisitCard({ encounter }: { encounter: PatientHistoryEncounter }) {
  return (
    <li>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/45 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{formatPatientDate(encounter.occurred_at)}</p>
              <span className="text-xs text-muted-foreground">{formatClock(encounter.occurred_at)}</span>
              {encounter.visit_number != null && (
                <Badge variant="outline">Visit {encounter.visit_number}</Badge>
              )}
            </div>
            {encounter.fees_inr !== null && (
              <span className="tnum text-sm font-semibold text-money">
                {formatINR(encounter.fees_inr)}
              </span>
            )}
          </header>

          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <ClinicalField label="Diagnosis" value={encounter.diagnosis} />
            <ClinicalField label="Treatment" value={encounter.treatment} />

            <div className="sm:col-span-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <PillIcon className="size-3.5" aria-hidden />
                Prescription
              </p>
              {encounter.prescription.length > 0 ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {encounter.prescription.map((medicine) => (
                    <li key={medicine.id} className="rounded-lg border border-border bg-background px-3 py-2.5">
                      <p className="text-sm font-medium">
                        {[medicine.drug_name, medicine.strength].filter(Boolean).join(" ")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[medicine.form, medicine.frequency, medicine.duration]
                          .filter(Boolean)
                          .join(" · ") || "Dose details not recorded"}
                      </p>
                      {medicine.instructions && (
                        <p className="mt-1 text-xs text-foreground">{medicine.instructions}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No medicines recorded.</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground sm:col-span-2">
              Recorded by {encounter.doctor_name || "clinic doctor"}
              {encounter.age_years != null ? ` · Age at visit ${encounter.age_years}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ClinicalField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
        {value || "Not recorded"}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum text-right font-medium capitalize">{value}</dd>
    </div>
  );
}

interface PatientDetailsForm {
  fullName: string;
  phone: string;
  ageYears: string;
  sex: string;
  abhaId: string;
  notes: string;
}

function PatientInput({
  label,
  value,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: "numeric" | "tel";
  onChange: (value: string) => void;
}) {
  const id = `patient-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function formatPatientDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
