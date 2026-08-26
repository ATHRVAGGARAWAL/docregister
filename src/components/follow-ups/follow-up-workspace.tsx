"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardClockIcon,
  Loader2Icon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon,
} from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FollowUpItem {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  due_at: string;
  reason: string;
  notes: string | null;
  status: "open" | "completed" | "cancelled";
  completed_at: string | null;
  completion_notes: string | null;
  patient_name?: string;
  patient_phone?: string | null;
  creator_name?: string;
}

export interface FollowUpPatient {
  id: string;
  full_name: string;
  phone?: string | null;
  age_years?: number | null;
  last_visit?: string | null;
  visit_count?: number | null;
}

/** Context supplied by a confirmed visit. Extra fields mirror CommitOutcome. */
export interface FollowUpEncounterContext {
  encounterId: string;
  patientId?: string;
  visitNumber?: number;
  isNewPatient?: boolean;
  alreadyCommitted?: boolean;
}

export interface FollowUpWorkspaceProps {
  /** Kept for existing callers; prefer `preselectedPatient` for a named selection. */
  initialPatientId?: string;
  /** Kept for existing callers; prefer `encounterContext`. */
  initialEncounterId?: string;
  preselectedPatient?: FollowUpPatient | null;
  encounterContext?: FollowUpEncounterContext | null;
  onCreated?: (followUp: FollowUpItem) => void;
}

type FollowUpFilter = "open" | "completed" | "all";
type PatientSearchResult = Required<Pick<FollowUpPatient, "id" | "full_name">> &
  Omit<FollowUpPatient, "id" | "full_name">;

const FILTERS: Array<{ value: FollowUpFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

const PATIENT_SEARCH_DELAY_MS = 250;

export function FollowUpWorkspace({
  initialPatientId,
  initialEncounterId,
  preselectedPatient,
  encounterContext,
  onCreated,
}: FollowUpWorkspaceProps) {
  const contextPatientId =
    preselectedPatient?.id ?? encounterContext?.patientId ?? initialPatientId ?? "";
  const contextEncounterId = encounterContext?.encounterId ?? initialEncounterId ?? "";
  const contextPatient = useMemo(
    () => makeInitialPatient(preselectedPatient, contextPatientId),
    [contextPatientId, preselectedPatient],
  );
  const contextSelectionKey = contextPatient
    ? [
        contextEncounterId,
        contextPatient.id,
        contextPatient.full_name,
        contextPatient.phone ?? "",
        contextPatient.age_years ?? "",
      ].join("\u0000")
    : "";

  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [filter, setFilter] = useState<FollowUpFilter>("open");
  const [listLoading, setListLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionTargetId, setCompletionTargetId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedPatient, setSelectedPatient] = useState<FollowUpPatient | null>(contextPatient);
  const [patientQuery, setPatientQuery] = useState(contextPatient?.full_name ?? "");
  const [patientOptions, setPatientOptions] = useState<PatientSearchResult[]>([]);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null);
  const [activePatientIndex, setActivePatientIndex] = useState(0);

  const [dueAt, setDueAt] = useState(() => defaultDueDate());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const patientInputRef = useRef<HTMLInputElement>(null);
  const appliedContextKeyRef = useRef(contextSelectionKey);
  const listboxId = useId();

  useEffect(() => {
    if (!contextPatient || appliedContextKeyRef.current === contextSelectionKey) return;
    const timer = window.setTimeout(() => {
      appliedContextKeyRef.current = contextSelectionKey;
      setSelectedPatient(contextPatient);
      setPatientQuery(contextPatient.full_name);
      setPatientOptions([]);
      setPatientSearchOpen(false);
      setPatientSearchError(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contextPatient, contextSelectionKey]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setListLoading(true);
      setListError(null);
      try {
        const response = await fetch(`/api/follow-ups?status=${filter}&limit=100`, {
          cache: "no-store",
          signal,
        });
        const payload = (await response.json()) as {
          followUps?: FollowUpItem[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not load follow-ups.");
        setItems(payload.followUps ?? []);
        setHasLoaded(true);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setListError(cause instanceof Error ? cause.message : "Could not load follow-ups.");
      } finally {
        if (!signal?.aborted) setListLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!patientSearchOpen || selectedPatient) return;

    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        void (async () => {
          setPatientSearchLoading(true);
          setPatientSearchError(null);
          try {
            const params = new URLSearchParams({
              q: patientQuery.trim(),
              limit: "8",
              offset: "0",
            });
            const response = await fetch(`/api/patients?${params.toString()}`, {
              cache: "no-store",
              signal: controller.signal,
            });
            const payload = (await response.json()) as {
              patients?: PatientSearchResult[];
              error?: string;
            };
            if (!response.ok) throw new Error(payload.error ?? "Could not search patients.");
            setPatientOptions(payload.patients ?? []);
            setActivePatientIndex(0);
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") return;
            setPatientOptions([]);
            setPatientSearchError(
              cause instanceof Error ? cause.message : "Could not search patients.",
            );
          } finally {
            if (!controller.signal.aborted) setPatientSearchLoading(false);
          }
        })();
      },
      patientQuery.trim() ? PATIENT_SEARCH_DELAY_MS : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [patientQuery, patientSearchOpen, selectedPatient]);

  function selectPatient(patient: PatientSearchResult) {
    setSelectedPatient(patient);
    setPatientQuery(patient.full_name);
    setPatientSearchOpen(false);
    setPatientSearchError(null);
  }

  function handlePatientKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setPatientSearchOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setPatientSearchOpen(true);
      if (patientOptions.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActivePatientIndex((current) =>
        (current + direction + patientOptions.length) % patientOptions.length,
      );
      return;
    }

    if (event.key === "Home" && patientSearchOpen && patientOptions.length > 0) {
      event.preventDefault();
      setActivePatientIndex(0);
      return;
    }

    if (event.key === "End" && patientSearchOpen && patientOptions.length > 0) {
      event.preventDefault();
      setActivePatientIndex(patientOptions.length - 1);
      return;
    }

    if (event.key === "Enter" && patientSearchOpen) {
      event.preventDefault();
      const activePatient = patientOptions[activePatientIndex];
      if (activePatient) selectPatient(activePatient);
    }
  }

  async function createFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) {
      setPatientSearchError("Choose a patient from the search results.");
      setPatientSearchOpen(true);
      patientInputRef.current?.focus();
      return;
    }

    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          encounterId: contextEncounterId || undefined,
          dueAt: new Date(`${dueAt}T12:00:00+05:30`).toISOString(),
          reason,
          notes: notes || undefined,
          idempotencyKey:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : undefined,
        }),
      });
      const payload = (await response.json()) as {
        followUp?: FollowUpItem;
        error?: string;
      };
      if (!response.ok || !payload.followUp) {
        throw new Error(payload.error ?? "Could not schedule follow-up.");
      }
      const createdFollowUp: FollowUpItem = {
        ...payload.followUp,
        patient_name: payload.followUp.patient_name ?? selectedPatient.full_name,
        patient_phone: payload.followUp.patient_phone ?? selectedPatient.phone ?? null,
      };
      if (filter === "open" || filter === "all") {
        setItems((current) => [createdFollowUp, ...current]);
      }
      setReason("");
      setNotes("");
      setDueAt(defaultDueDate());
      setNotice(`Follow-up scheduled for ${selectedPatient.full_name}.`);
      onCreated?.(createdFollowUp);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not schedule follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function complete(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setCompletingId(id);
    setCompletionError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/follow-ups/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionNotes: completionNotes.trim() || null }),
      });
      const payload = (await response.json()) as {
        followUp?: FollowUpItem;
        error?: string;
      };
      if (!response.ok || !payload.followUp) {
        throw new Error(payload.error ?? "Could not complete follow-up.");
      }

      const completed = payload.followUp;
      setItems((current) =>
        filter === "open"
          ? current.filter((item) => item.id !== id)
          : current.map((item) => (item.id === id ? { ...item, ...completed } : item)),
      );
      setCompletionTargetId(null);
      setCompletionNotes("");
      setNotice("Follow-up marked completed.");
    } catch (cause) {
      setCompletionError(cause instanceof Error ? cause.message : "Could not complete follow-up.");
    } finally {
      setCompletingId(null);
    }
  }

  const emptyCopy = emptyStateCopy(filter);
  const countLabel = `${items.length} ${filter === "all" ? "shown" : filter}`;
  const selectedPatientPhone = maskPhone(selectedPatient?.phone);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
      <section className="surface-card overflow-hidden rounded-2xl" aria-labelledby="follow-up-queue-title">
        <header className="border-b border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-primary-soft text-primary">
                <ClipboardClockIcon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="follow-up-queue-title" className="text-base font-semibold tracking-[-0.02em]">
                  Follow-up queue
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Return cues for the next patient touchpoint.
                </p>
              </div>
            </div>
            <span className="surface-inset tnum flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground">
              {listLoading ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
              {countLabel}
            </span>
          </div>

          <div className="mt-4 inline-grid grid-cols-3 rounded-xl border border-border bg-background p-1" role="group" aria-label="Filter follow-ups">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                disabled={listLoading || completingId !== null || saving}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:min-h-11",
                  filter === option.value
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                onClick={() => {
                  if (filter === option.value) return;
                  setItems([]);
                  setHasLoaded(false);
                  setFilter(option.value);
                  setCompletionTargetId(null);
                  setCompletionNotes("");
                  setNotice(null);
                  setCompletionError(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="bg-card p-3 sm:p-4" aria-busy={listLoading}>
          {listError ? (
            <Alert variant="destructive" role="alert" className="mb-3">
              <AlertTitle>Couldn’t load follow-ups</AlertTitle>
              <AlertDescription>
                {listError}{" "}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void load()}>
                  Try again
                </button>
              </AlertDescription>
            </Alert>
          ) : null}

          {completionError ? (
            <Alert variant="destructive" role="alert" className="mb-3">
              <AlertTitle>Couldn’t complete this follow-up</AlertTitle>
              <AlertDescription>{completionError}</AlertDescription>
            </Alert>
          ) : null}

          {notice ? (
            <p role="status" className="mb-3 rounded-xl border border-border bg-money-soft px-3 py-2.5 text-xs font-medium text-money">
              {notice}
            </p>
          ) : null}

          {listLoading && !hasLoaded ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-border bg-background">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                Loading follow-ups…
              </p>
            </div>
          ) : listError && !hasLoaded ? null : items.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-background p-6 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-full border border-border bg-money-soft text-money">
                  <CheckCircle2Icon className="size-4.5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground">{emptyCopy.title}</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  {emptyCopy.description}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-background">
              {items.map((item) => {
                const overdue = item.status === "open" && isOverdue(item.due_at);
                const editingCompletion = completionTargetId === item.id;
                const patientPhone = maskPhone(item.patient_phone);

                return (
                  <li key={item.id} className="p-3.5 sm:p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-primary">
                        <UserRoundIcon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold tracking-[-0.01em]">
                                {item.patient_name ?? "Patient"}
                              </p>
                              <StatusBadge status={item.status} />
                            </div>
                            <p className="mt-1 text-sm leading-5 text-foreground">{item.reason}</p>
                          </div>
                          {item.status === "open" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-expanded={editingCompletion}
                              onClick={() => {
                                setCompletionTargetId(editingCompletion ? null : item.id);
                                setCompletionNotes("");
                                setCompletionError(null);
                              }}
                            >
                              <CheckCircle2Icon className="size-3.5" aria-hidden />
                              Complete
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className={cn("flex items-center gap-1.5 font-medium", overdue ? "text-destructive" : "text-primary")}>
                            <CalendarDaysIcon className="size-3.5" aria-hidden />
                            {overdue ? "Overdue" : "Due"} {formatDueDate(item.due_at)}
                          </span>
                          {patientPhone ? (
                            <span className="flex items-center gap-1.5">
                              <PhoneIcon className="size-3.5" aria-hidden />
                              <span className="tnum">{patientPhone}</span>
                            </span>
                          ) : null}
                          {item.completed_at ? (
                            <span className="tnum">Completed {formatDueDate(item.completed_at)}</span>
                          ) : null}
                        </div>

                        {item.notes ? (
                          <p className="mt-2.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">
                            {item.notes}
                          </p>
                        ) : null}
                        {item.completion_notes ? (
                          <div className="mt-2.5 rounded-lg border border-border bg-money-soft px-3 py-2 text-xs leading-5 text-foreground">
                            <span className="font-semibold text-money">Completion note:</span>{" "}
                            {item.completion_notes}
                          </div>
                        ) : null}

                        {editingCompletion ? (
                          <form className="mt-3 rounded-xl border border-border bg-secondary p-3" onSubmit={(event) => void complete(event, item.id)}>
                            <Label htmlFor={`completion-notes-${item.id}`}>
                              Completion notes{" "}
                              <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                              id={`completion-notes-${item.id}`}
                              className="mt-2 min-h-20 bg-background"
                              maxLength={2000}
                              autoFocus
                              value={completionNotes}
                              onChange={(event) => setCompletionNotes(event.target.value)}
                              placeholder="Outcome, advice given, or next step"
                            />
                            <div className="mt-3 flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={completingId === item.id}
                                onClick={() => {
                                  setCompletionTargetId(null);
                                  setCompletionNotes("");
                                }}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" size="sm" disabled={completingId === item.id}>
                                {completingId === item.id ? (
                                  <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <CheckCircle2Icon className="size-3.5" aria-hidden />
                                )}
                                Mark completed
                              </Button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="surface-card overflow-visible rounded-2xl xl:sticky xl:top-5" aria-labelledby="schedule-follow-up-title">
        <header className="rounded-t-2xl border-b border-border bg-card px-4 py-4 sm:px-5">
          <span className="mb-3 grid size-9 place-items-center rounded-xl border border-border bg-primary-soft text-primary">
            <PlusIcon className="size-4" aria-hidden />
          </span>
          <h2 id="schedule-follow-up-title" className="text-base font-semibold tracking-[-0.02em]">
            Schedule follow-up
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Set a clear return cue for an existing patient.
          </p>
        </header>

        <div className="rounded-b-2xl bg-card p-4 sm:p-5">
          {formError ? (
            <Alert variant="destructive" role="alert" className="mb-4">
              <AlertTitle>Couldn’t schedule follow-up</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <form className="space-y-4" onSubmit={(event) => void createFollowUp(event)}>
            <div className="space-y-2">
              <Label htmlFor="follow-up-patient">Patient</Label>
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setPatientSearchOpen(false);
                  }
                }}
              >
                <SearchIcon className="pointer-events-none absolute left-3.5 top-[1.35rem] z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  ref={patientInputRef}
                  id="follow-up-patient"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={patientSearchOpen}
                  aria-controls={listboxId}
                  aria-activedescendant={
                    patientSearchOpen && patientOptions[activePatientIndex]
                      ? `${listboxId}-option-${activePatientIndex}`
                      : undefined
                  }
                  aria-invalid={patientSearchError ? true : undefined}
                  value={patientQuery}
                  onFocus={() => {
                    if (!selectedPatient) setPatientSearchOpen(true);
                  }}
                  onKeyDown={handlePatientKeyDown}
                  onChange={(event) => {
                    setPatientQuery(event.target.value);
                    setSelectedPatient(null);
                    setPatientOptions([]);
                    setPatientSearchOpen(true);
                    setPatientSearchError(null);
                    setActivePatientIndex(0);
                  }}
                  placeholder="Search by name or phone"
                  autoComplete="off"
                  maxLength={120}
                  className="bg-background pl-10 pr-10"
                />
                {selectedPatient ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [@media(pointer:coarse)]:right-0 [@media(pointer:coarse)]:top-0 [@media(pointer:coarse)]:size-11"
                    aria-label="Clear selected patient"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientQuery("");
                      setPatientOptions([]);
                      setPatientSearchOpen(true);
                      window.requestAnimationFrame(() => patientInputRef.current?.focus());
                    }}
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                ) : null}

                {patientSearchOpen && !selectedPatient ? (
                  <div className="surface-elevated absolute inset-x-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-xl bg-popover">
                    <ul id={listboxId} role="listbox" aria-label="Patient search results" className="max-h-64 overflow-y-auto p-1">
                      {patientSearchLoading ? (
                        <li role="option" aria-selected="false" aria-disabled="true" className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                          Searching patients…
                        </li>
                      ) : patientOptions.length > 0 ? (
                        patientOptions.map((patient, index) => (
                          <li key={patient.id} role="presentation">
                            <button
                              id={`${listboxId}-option-${index}`}
                              role="option"
                              aria-selected={index === activePatientIndex}
                              type="button"
                              tabIndex={-1}
                              className={cn(
                                "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                                index === activePatientIndex
                                  ? "bg-primary-soft text-foreground"
                                  : "bg-popover hover:bg-secondary",
                              )}
                              onMouseEnter={() => setActivePatientIndex(index)}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectPatient(patient)}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-primary">
                                <UserRoundIcon className="size-3.5" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{patient.full_name}</span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {patient.age_years == null ? "Age not recorded" : `${patient.age_years} years`}
                                  <span aria-hidden> · </span>
                                  <span className="tnum">{maskPhone(patient.phone ?? null) ?? "No phone"}</span>
                                </span>
                              </span>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li role="option" aria-selected="false" aria-disabled="true" className="px-3 py-3 text-xs leading-5 text-muted-foreground">
                          {patientQuery.trim() ? "No patients match this search." : "Start typing or choose a recent patient."}
                        </li>
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>
              {patientSearchError ? (
                <p className="text-xs text-destructive" role="alert">{patientSearchError}</p>
              ) : selectedPatient ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2Icon className="size-3.5 text-money" aria-hidden />
                  Selected chart
                  {selectedPatientPhone ? <span className="tnum">· {selectedPatientPhone}</span> : null}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Choose a matching chart before scheduling.</p>
              )}
            </div>

            {contextEncounterId ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                <ClipboardClockIcon className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Linked to the confirmed visit
                  {encounterContext?.visitNumber ? (
                    <span className="tnum font-semibold text-foreground"> #{encounterContext.visitNumber}</span>
                  ) : null}
                </span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="follow-up-date">Due date</Label>
              <Input id="follow-up-date" className="bg-background" type="date" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow-up-reason">Reason</Label>
              <Input id="follow-up-reason" className="bg-background" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review blood pressure" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow-up-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="follow-up-notes" className="bg-background" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bring home readings" />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={saving || !selectedPatient}>
              {saving ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <PlusIcon className="size-4" aria-hidden />}
              Schedule return
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: FollowUpItem["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
        status === "open" && "bg-primary-soft text-primary",
        status === "completed" && "bg-money-soft text-money",
        status === "cancelled" && "bg-secondary text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function makeInitialPatient(
  patient: FollowUpPatient | null | undefined,
  patientId: string,
): FollowUpPatient | null {
  if (patient) return patient;
  if (!patientId) return null;
  return { id: patientId, full_name: "Patient from confirmed visit" };
}

function emptyStateCopy(filter: FollowUpFilter) {
  if (filter === "completed") {
    return {
      title: "No completed follow-ups",
      description: "Completed patient touchpoints will remain available here for reference.",
    };
  }
  if (filter === "all") {
    return {
      title: "No follow-ups yet",
      description: "Schedule a return date and it will appear in this workspace.",
    };
  }
  return {
    title: "Queue is clear",
    description: "Schedule a return date after a visit and it will stay visible here until completed.",
  };
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function formatDueDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function isOverdue(value: string): boolean {
  const due = new Date(value);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}
