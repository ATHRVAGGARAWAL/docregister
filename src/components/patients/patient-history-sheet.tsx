"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ClipboardListIcon,
  LoaderCircleIcon,
  PencilIcon,
  PillIcon,
  SaveIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  XIcon,
} from "@/components/icons";

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
import { formatClock, maskPhone } from "@/lib/format";
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
        const payload = await readBody(response, "Could not open this patient chart.");
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
      const payload = await readBody(response, "Could not update this patient chart.");

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
      <SheetContent className="surface-elevated overflow-hidden border-border bg-card sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-5xl">
        <SheetHeader className="relative border-b border-border pr-14 sm:px-7 sm:pt-6 sm:pb-5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[1rem] border border-primary/20 bg-primary-soft text-sm font-semibold tracking-[-0.03em] text-primary">
              {patientInitials(history?.patient.full_name ?? patient?.full_name ?? "Patient")}
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl tracking-[-0.035em]">
                {history?.patient.full_name ?? patient?.full_name ?? "Patient chart"}
              </SheetTitle>
              <SheetDescription className="mt-1">
                Longitudinal chart, medicines, and master patient details.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {loading && (
            <div className="surface-card grid min-h-72 place-items-center rounded-[1.5rem]">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
                Opening patient chart…
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <ShieldCheckIcon className="mt-0.5 size-4" aria-hidden />
              <AlertTitle>Couldn’t open the chart</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {history && (
            <div className="space-y-5">
              <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                  icon={StethoscopeIcon}
                  label="Distinct diagnoses"
                  value={String(totals.diagnoses)}
                />
              </section>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Medical timeline
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">All visits</h2>
                  </div>

                  {history.encounters.length === 0 ? (
                    <Card className="surface-card gap-0 rounded-[1.35rem] border-border bg-card py-0">
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
                    <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[1.18rem] before:top-4 before:w-px before:bg-border sm:before:left-[1.43rem]">
                      {history.encounters.map((encounter) => (
                        <VisitCard key={encounter.id} encounter={encounter} />
                      ))}
                    </ol>
                  )}
                </section>

                <aside className="space-y-3 lg:sticky lg:top-0">
                  <Card className="surface-card gap-0 rounded-[1.4rem] border-border bg-card py-0">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
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
                        <dl className="mt-4 divide-y divide-border text-sm">
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
                    <Alert variant="default" role="note" className="surface-card rounded-[1.2rem] border-primary/20 bg-primary-soft">
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

        <SheetFooter className="relative border-border bg-card sm:px-7">
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
    <Card className="surface-card gap-0 rounded-[1.2rem] border-border bg-card py-0 last:col-span-2 sm:last:col-span-1">
      <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[0.8rem] border border-primary/20 bg-primary-soft text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="tnum mt-1 truncate text-sm font-semibold tracking-[-0.02em] sm:text-base">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function VisitCard({ encounter }: { encounter: PatientHistoryEncounter }) {
  return (
    <li className="relative pl-9 sm:pl-11">
      <span className="absolute left-[0.78rem] top-5 z-10 size-3 rounded-full border-[3px] border-card bg-primary sm:left-[1.03rem]" aria-hidden />
      <Card className="surface-card gap-0 overflow-hidden rounded-[1.35rem] border-border bg-card py-0 transition-colors hover:border-primary/20 hover:bg-card">
        <CardContent className="p-0">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-[-0.015em]">{formatPatientDate(encounter.occurred_at)}</p>
              <span className="surface-inset rounded-full px-2 py-0.5 text-xs text-muted-foreground">{formatClock(encounter.occurred_at)}</span>
              {encounter.visit_number != null && (
                <Badge variant="outline">Visit {encounter.visit_number}</Badge>
              )}
            </div>
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
                    <li key={medicine.id} className="surface-inset rounded-[0.9rem] px-3 py-2.5">
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
    <div className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
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

/**
 * Read a JSON body, but only once the response is known to be one.
 *
 * Calling `.json()` before checking `ok` means a non-JSON failure — a proxy's
 * HTML 502, a 504, an empty body — rejects in the parser and the `!ok` branch
 * never runs, so the doctor is shown "Unexpected token '<'" instead of the
 * message written for them. This is now the directory's primary tap path.
 */
async function readBody(response: Response, fallback: string): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : fallback);
  }
  return payload;
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
