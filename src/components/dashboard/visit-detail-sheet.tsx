"use client";

import { useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  FileTextIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PillIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  UserRoundIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatClock } from "@/lib/format";
import type { VisitDetailsPayload } from "@/lib/types";

export function VisitDetailSheet({
  visitId,
  open,
  onOpenChange,
  onAmended,
}: {
  visitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAmended?: () => void;
}) {
  const [request, setRequest] = useState<{ id: string; data: VisitDetailsPayload | null; error: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ diagnosis: "", treatment: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !visitId) return;
    const controller = new AbortController();
    fetch(`/api/encounters/${encodeURIComponent(visitId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Could not open this visit.");
        const data = payload as VisitDetailsPayload;
        setRequest({ id: visitId, data, error: null });
        setForm({
          diagnosis: data.encounter.effective.diagnosis ?? "",
          treatment: data.encounter.effective.treatment ?? "",
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setRequest({ id: visitId, data: null, error: cause instanceof Error ? cause.message : "Could not open this visit." });
      });
    return () => controller.abort();
  }, [open, visitId]);

  const data = request?.id === visitId ? request.data : null;
  const error = request?.id === visitId ? request.error : null;
  const loading = open && Boolean(visitId) && request?.id !== visitId;
  const encounter = data?.encounter;

  function beginCorrection() {
    if (!encounter) return;
    setForm({
      diagnosis: encounter.effective.diagnosis ?? "",
      treatment: encounter.effective.treatment ?? "",
    });
    setReason("");
    setFormError(null);
    setEditing(true);
  }

  async function saveCorrection() {
    if (!encounter || !visitId) return;
    if (!reason.trim()) {
      setFormError("A reason is required for every correction.");
      return;
    }
    const changes: Record<string, unknown> = {};
    if (form.diagnosis !== (encounter.effective.diagnosis ?? "")) changes.diagnosis = form.diagnosis.trim() || null;
    if (form.treatment !== (encounter.effective.treatment ?? "")) changes.treatment = form.treatment.trim() || null;
    if (Object.keys(changes).length === 0) {
      setFormError("Change at least one value before recording a correction.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/encounters/${encodeURIComponent(visitId)}/amendments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), changes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Could not record this correction.");
      const refreshed = await fetch(`/api/encounters/${encodeURIComponent(visitId)}`);
      const next = await refreshed.json();
      if (!refreshed.ok) throw new Error(next?.error ?? "Correction saved, but the visit could not be refreshed.");
      setRequest({ id: visitId, data: next as VisitDetailsPayload, error: null });
      setEditing(false);
      setReason("");
      onAmended?.();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not record this correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:h-[88dvh] sm:max-h-[88dvh] sm:max-w-4xl">
        <SheetHeader className="border-b border-border pr-14 sm:px-7 sm:pt-6 sm:pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <StethoscopeIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{encounter?.patient?.full_name ?? encounter?.patient_name_spoken ?? "Visit details"}</SheetTitle>
              <SheetDescription>Signed visit record, transcript evidence, and audited corrections.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-secondary/25 px-5 py-5 sm:px-7">
          {loading && <div className="grid min-h-72 place-items-center rounded-xl border border-border bg-card"><p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden />Opening visit…</p></div>}
          {error && <Alert variant="destructive"><ShieldCheckIcon className="mt-0.5 size-4" aria-hidden /><AlertTitle>Couldn’t open the visit</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {encounter && (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-3">
                <InfoCard icon={CalendarDaysIcon} label="Recorded" value={`${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(encounter.occurred_at))} · ${formatClock(encounter.occurred_at)}`} />
                <InfoCard icon={UserRoundIcon} label="Clinician" value={encounter.clinician?.full_name ?? "Unknown"} />
                <InfoCard icon={CheckCircle2Icon} label="Status" value={encounter.status === "committed" ? `Confirmed${encounter.visit_number ? ` · Visit ${encounter.visit_number}` : ""}` : encounter.status} />
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Clinical note</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Effective record</h2></div>
                  {encounter.status === "committed" && !editing && <Button type="button" variant="outline" size="sm" onClick={beginCorrection}><PencilLineIcon aria-hidden /> Correct visit</Button>}
                </div>
                {editing ? (
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2"><Label htmlFor="visit-diagnosis">Diagnosis</Label><Textarea id="visit-diagnosis" value={form.diagnosis} onChange={(event) => setForm((current) => ({ ...current, diagnosis: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor="visit-treatment">Treatment / advice</Label><Textarea id="visit-treatment" value={form.treatment} onChange={(event) => setForm((current) => ({ ...current, treatment: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor="visit-reason">Reason for correction <span className="text-destructive">*</span></Label><Textarea id="visit-reason" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Clarified the diagnosis after reviewing the note" /></div>
                    {formError && <p className="text-sm text-destructive">{formError}</p>}
                    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button><Button type="button" onClick={() => void saveCorrection()} disabled={saving}>{saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}Record correction</Button></div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <Detail label="Diagnosis" value={encounter.effective.diagnosis} />
                    <Detail label="Treatment / advice" value={encounter.effective.treatment} wide />
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-5"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"><PillIcon className="size-3.5" aria-hidden />Prescription</p>{encounter.effective.prescription.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No medicines recorded.</p> : <ul className="mt-3 divide-y divide-border">{encounter.effective.prescription.map((item, index) => <li key={item.id ?? `${item.drug_name}-${index}`} className="py-3 first:pt-0 last:pb-0"><p className="font-medium">{item.drug_name}{item.strength ? ` · ${item.strength}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{[item.form, item.frequency_label ?? item.frequency_spoken, item.duration, item.instructions].filter(Boolean).join(" · ") || "Instructions not recorded"}</p></li>)}</ul>}</section>

              {encounter.transcript && <section className="rounded-xl border border-border bg-card p-5"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"><FileTextIcon className="size-3.5" aria-hidden />Transcript evidence {encounter.transcript.degraded && <Badge variant="warning">Fallback transcription</Badge>}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{encounter.transcript.raw_text}</p>{encounter.transcript.roman_text && <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Romanised transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{encounter.transcript.roman_text}</p></details>}<p className="mt-3 text-xs text-muted-foreground">{encounter.transcript.provider}{encounter.transcript.language_code ? ` · ${encounter.transcript.language_code}` : ""}{encounter.transcript.confidence === null ? "" : ` · ${Math.round(encounter.transcript.confidence * 100)}% confidence`}</p></section>}

              <section className="rounded-xl border border-border bg-card p-5"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"><HistoryIcon className="size-3.5" aria-hidden />Amendment history</p>{data.amendments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No corrections. The source visit is unchanged.</p> : <ol className="mt-3 space-y-3">{data.amendments.map((amendment) => <li key={amendment.id} className="rounded-lg border border-border bg-secondary/35 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Revision {amendment.revision}</Badge><span className="text-xs text-muted-foreground">{amendment.author.full_name ?? "Unknown author"} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(amendment.created_at))}</span></div><p className="mt-2 text-sm">{amendment.reason}</p><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Before / after values</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="overflow-x-auto rounded bg-background p-2">{JSON.stringify(amendment.before_values, null, 2)}</pre><pre className="overflow-x-auto rounded bg-background p-2">{JSON.stringify(amendment.after_values, null, 2)}</pre></div></details></li>)}</ol>}</section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof CalendarDaysIcon; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><Icon className="size-4 text-primary" aria-hidden /><p className="mt-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function Detail({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{value || "Not recorded"}</p></div>;
}
