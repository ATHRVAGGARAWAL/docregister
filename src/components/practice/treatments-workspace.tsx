"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LoaderCircleIcon, PlusIcon, SearchIcon, ToothIcon, UserRoundIcon } from "@/components/icons";
import { PracticePage, PracticePageHeader } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { formatINR } from "@/lib/format";
import type { TreatmentPlan } from "@/lib/practice/types";

type PatientChoice = Pick<PatientMatch, "id" | "full_name">;

export function TreatmentsWorkspace({ initialPatientId }: { initialPatientId?: string }) {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(Boolean(initialPatientId));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/treatment-plans");
      const body = await response.json().catch(() => null) as { error?: string; plans?: TreatmentPlan[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not load treatment plans.");
      setPlans(body?.plans ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load treatment plans."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const active = plans.filter((plan) => ["proposed", "accepted", "active"].includes(plan.status));
  const proposed = plans.filter((plan) => plan.status === "proposed").length;
  const value = active.flatMap((plan) => plan.items ?? []).filter((item) => !["completed", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_paise) - item.discount_paise, 0);

  return (
    <PracticePage>
      <PracticePageHeader eyebrow="Care delivery" title="Treatment plans" description="Turn findings into phased, costed care and keep every sitting tied to the patient’s clinical record." actions={<Button onClick={() => setOpen(true)}><PlusIcon aria-hidden />New plan</Button>} />
      <section className="grid gap-3 sm:grid-cols-3"><SmallMetric label="Active plans" value={String(active.length)} /><SmallMetric label="Awaiting acceptance" value={String(proposed)} /><SmallMetric label="Open planned value" value={formatINR(value / 100)} /></section>
      {error && <Alert variant="destructive"><AlertTitle>Treatment plans unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <section className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => {
          const planValue = (plan.items ?? []).reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_paise) - item.discount_paise, 0);
          const completed = (plan.items ?? []).filter((item) => item.status === "completed").length;
          return <article key={plan.id} className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">{plan.patient?.full_name ?? "Patient"}</p><h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{plan.title}</h2><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{plan.diagnosis || "No diagnosis summary"}</p></div><Badge variant="outline" className="capitalize">{plan.status}</Badge></div><div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-border bg-background p-3"><PlanStat label="Items" value={String(plan.items?.length ?? 0)} /><PlanStat label="Completed" value={String(completed)} /><PlanStat label="Value" value={formatINR(planValue / 100)} /></div><div className="mt-4 flex items-center justify-between gap-3"><Badge variant="outline" className="capitalize">{plan.priority} priority</Badge>{plan.patient_id && <Button asChild variant="ghost" size="sm"><Link href={`/patients/${plan.patient_id}`}>Open chart</Link></Button>}</div></article>;
        })}
        {!loading && plans.length === 0 && !error && <div className="surface-card rounded-[1.35rem] bg-card px-6 py-14 text-center lg:col-span-2"><ToothIcon className="mx-auto size-7 text-primary" aria-hidden /><h2 className="mt-4 text-base font-semibold">No treatment plans yet</h2><p className="mt-2 text-sm text-muted-foreground">Start with a patient, diagnosis and the first planned procedure.</p><Button className="mt-5" onClick={() => setOpen(true)}>Create the first plan</Button></div>}
        {loading && <p className="py-16 text-center text-sm text-muted-foreground lg:col-span-2"><LoaderCircleIcon className="mr-2 inline size-4 animate-spin" aria-hidden />Loading plans…</p>}
      </section>
      <NewPlanSheet open={open} onOpenChange={setOpen} initialPatientId={initialPatientId} onCreated={async () => { setOpen(false); await load(); }} />
    </PracticePage>
  );
}

function NewPlanSheet({ open, onOpenChange, initialPatientId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; initialPatientId?: string; onCreated: () => Promise<void> }) {
  const [patient, setPatient] = useState<PatientChoice | null>(null); const [query, setQuery] = useState(""); const [matches, setMatches] = useState<PatientMatch[]>([]); const [title, setTitle] = useState(""); const [diagnosis, setDiagnosis] = useState(""); const [procedure, setProcedure] = useState(""); const [tooth, setTooth] = useState(""); const [price, setPrice] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!initialPatientId || patient) return;
    const controller = new AbortController();
    fetch(`/api/patients/${encodeURIComponent(initialPatientId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the selected patient.");
        return response.json() as Promise<PatientChoice>;
      })
      .then(setPatient)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Could not load the selected patient.");
      });
    return () => controller.abort();
  }, [initialPatientId, patient]);
  useEffect(() => { if (patient || query.trim().length < 2) return; const controller = new AbortController(); const timer = window.setTimeout(() => { fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then((response) => response.json()).then((body: { patients?: PatientMatch[] }) => setMatches(body.patients?.slice(0, 6) ?? [])).catch(() => setMatches([])); }, 250); return () => { window.clearTimeout(timer); controller.abort(); }; }, [patient, query]);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!patient) return; setSaving(true); setError(null); try { const item = procedure.trim() ? [{ procedureName: procedure, scope: tooth ? "tooth" : "other", toothFdi: tooth ? Number(tooth) : undefined, unitPricePaise: Math.round(Number(price || 0) * 100) }] : []; const response = await fetch("/api/treatment-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: patient.id, title, diagnosis, items: item }) }); const body = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "Could not create the plan."); setPatient(null); setQuery(""); setTitle(""); setDiagnosis(""); setProcedure(""); setTooth(""); setPrice(""); await onCreated(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the plan."); } finally { setSaving(false); } }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto bg-card sm:max-w-lg"><SheetHeader><SheetTitle>New treatment plan</SheetTitle><SheetDescription>Start with the clinical intent. More phases and items can be added as care evolves.</SheetDescription></SheetHeader><form onSubmit={(event) => void submit(event)} className="space-y-4 px-4 pb-8 sm:px-6"><div className="space-y-2"><Label>Patient</Label>{patient ? <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft px-3 text-left" onClick={() => setPatient(null)}><UserRoundIcon className="size-4 text-primary" aria-hidden /><span className="flex-1 text-sm font-semibold">{patient.full_name}</span><span className="text-xs text-muted-foreground">Change</span></button> : <><div className="relative"><SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search patient" /></div>{matches.length > 0 && <div className="overflow-hidden rounded-lg border border-border">{matches.map((match) => <button key={match.id} type="button" className="block min-h-11 w-full border-b border-border px-3 text-left text-sm last:border-0 hover:bg-secondary" onClick={() => setPatient(match)}>{match.full_name}</button>)}</div>}</>}</div><div className="space-y-2"><Label htmlFor="plan-title">Plan title</Label><Input id="plan-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Restore lower-left quadrant" required /></div><div className="space-y-2"><Label htmlFor="plan-diagnosis">Diagnosis summary</Label><Textarea id="plan-diagnosis" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} rows={3} /></div><div className="rounded-xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">First item</p><div className="mt-3 space-y-3"><Input value={procedure} onChange={(event) => setProcedure(event.target.value)} placeholder="Procedure name" /><div className="grid grid-cols-2 gap-3"><Input value={tooth} onChange={(event) => setTooth(event.target.value)} inputMode="numeric" placeholder="FDI tooth" /><Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="Fee ₹" /></div></div></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={saving || !patient || !title.trim()}>{saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}Create plan</Button></form></SheetContent></Sheet>;
}

function SmallMetric({ label, value }: { label: string; value: string }) { return <article className="surface-card rounded-[1.15rem] bg-card p-4"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="tnum mt-2 text-2xl font-semibold tracking-[-0.05em]">{value}</p></article>; }
function PlanStat({ label, value }: { label: string; value: string }) { return <div><p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="tnum mt-1 text-sm font-semibold">{value}</p></div>; }
