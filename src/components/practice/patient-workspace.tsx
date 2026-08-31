"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { PermanentArchViewer } from "@/components/dental/permanent-arch-viewer";
import { ArrowLeftIcon, CalendarDaysIcon, CircleAlertIcon, LoaderCircleIcon, PlusIcon, ReceiptTextIcon, ToothIcon } from "@/components/icons";
import { PatientConsentsPanel } from "@/components/practice/patient-consents-panel";
import { PracticePage, PracticePageHeader, SectionHeading } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { deriveToothStatus, type ToothProcedureRecord } from "@/lib/dental/tooth-status";
import { formatINR, maskPhone } from "@/lib/format";
import type { PatientAlert, ToothFinding, TreatmentPlan } from "@/lib/practice/types";
import type { PatientHistoryPayload } from "@/lib/types";

interface ClinicalPayload {
  alerts: PatientAlert[];
  medicalHistory: { id: string; category: string; name: string; status: string; detail: string | null }[];
  findings: ToothFinding[];
  periodontal: { id: string; tooth_fdi: number; site: string; pocket_depth_mm: number | null; bleeding: boolean; measured_at: string }[];
  imaging: { id: string; label: string; modality: string; url: string; taken_at: string | null; note: string | null }[];
}

export function PatientWorkspace({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<PatientHistoryPayload | null>(null);
  const [clinical, setClinical] = useState<ClinicalPayload | null>(null);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicalReady, setClinicalReady] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const historyResponse = await fetch(`/api/patients/${encodeURIComponent(patientId)}/history`);
      const historyBody = await historyResponse.json().catch(() => null) as PatientHistoryPayload & { error?: string };
      if (!historyResponse.ok) throw new Error(historyBody?.error ?? "Could not open this patient chart.");
      setHistory(historyBody);

      const [clinicalResponse, plansResponse] = await Promise.all([
        fetch(`/api/patients/${encodeURIComponent(patientId)}/clinical`),
        fetch(`/api/treatment-plans?patientId=${encodeURIComponent(patientId)}`),
      ]);
      if (clinicalResponse.ok) setClinical(await clinicalResponse.json() as ClinicalPayload);
      else setClinicalReady(false);
      if (plansResponse.ok) {
        const body = await plansResponse.json() as { plans?: TreatmentPlan[] };
        setPlans(body.plans ?? []);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this patient chart.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toothStatus = useMemo(
    () =>
      deriveToothStatus(
        (history?.toothProcedures ?? []) as ToothProcedureRecord[],
        clinical?.findings ?? [],
      ),
    [history?.toothProcedures, clinical?.findings],
  );

  if (loading) return <PracticePage><div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground"><LoaderCircleIcon className="mr-2 inline size-4 animate-spin" aria-hidden />Opening patient workspace…</div></PracticePage>;
  if (error || !history) return <PracticePage><Alert variant="destructive"><AlertTitle>Patient chart unavailable</AlertTitle><AlertDescription>{error ?? "Patient chart not found."}</AlertDescription></Alert></PracticePage>;

  const patient = history.patient;
  const activeAlerts = clinical?.alerts.filter((alert) => alert.is_active) ?? [];
  const totalPlanned = plans.flatMap((plan) => plan.items ?? []).filter((item) => !["cancelled", "completed"].includes(item.status)).reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_paise) - item.discount_paise, 0);

  return (
    <PracticePage>
      <Link href="/patients" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" aria-hidden />Back to patients</Link>
      <PracticePageHeader
        eyebrow="Patient workspace"
        title={patient.full_name}
        description={`${patient.age_years == null ? "Age not recorded" : `${patient.age_years} years`} · ${patient.sex || "Sex not recorded"} · ${maskPhone(patient.phone) ?? "No phone"}`}
        actions={<Button asChild><Link href="/"><PlusIcon aria-hidden />New clinical note</Link></Button>}
      />

      {activeAlerts.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {activeAlerts.map((alert) => <Alert key={alert.id} variant={alert.severity === "critical" ? "destructive" : "default"} className={alert.severity === "important" ? "border-warning/30 bg-warning-soft" : undefined}><CircleAlertIcon aria-hidden /><AlertTitle>{alert.label}</AlertTitle><AlertDescription>{alert.note ?? alert.kind.replaceAll("_", " ")}</AlertDescription></Alert>)}
        </div>
      )}

      {!clinicalReady && <Alert><AlertTitle>Structured chart setup pending</AlertTitle><AlertDescription>Visit history and the derived dental chart are available. Apply migrations 0029–0036 to enable findings, alerts, plans, lab, inventory, billing and scheduling safeguards.</AlertDescription></Alert>}

      <Tabs defaultValue="overview" className="gap-5">
        <div className="overflow-x-auto pb-1"><TabsList className="min-w-max"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="chart">3D Chart</TabsTrigger><TabsTrigger value="visits">Visits</TabsTrigger><TabsTrigger value="plan">Treatment Plan</TabsTrigger><TabsTrigger value="imaging">Imaging Links</TabsTrigger><TabsTrigger value="documents">Consents</TabsTrigger><TabsTrigger value="finance">Finance</TabsTrigger></TabsList></div>

        <TabsContent value="overview" className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Visits" value={String(history.encounters.length)} detail={history.encounters[0] ? `Last ${shortDate(history.encounters[0].occurred_at)}` : "No confirmed visits"} />
            <Summary label="Teeth with history" value={String(toothStatus.size)} detail="Derived from confirmed care" />
            <Summary label="Open plan value" value={formatINR(totalPlanned / 100)} detail={`${plans.length} treatment plan${plans.length === 1 ? "" : "s"}`} />
            <Summary label="Clinical alerts" value={String(activeAlerts.length)} detail={activeAlerts.length ? "Review before treatment" : "No active alerts"} />
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
            <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Recent visits" description="Confirmed clinical history, newest first." /><VisitList encounters={history.encounters.slice(0, 5)} /></section>
            <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Medical context" description="Structured entries and the original chart note." /><div className="mt-4 space-y-3">{clinical?.medicalHistory.slice(0, 5).map((item) => <div key={item.id} className="rounded-lg border border-border bg-background p-3"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{item.name}</p><Badge variant="outline" className="capitalize">{item.status}</Badge></div>{item.detail && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}</div>)}{clinical?.medicalHistory.length === 0 && !patient.notes && <p className="py-6 text-center text-sm text-muted-foreground">No structured medical history recorded.</p>}{patient.notes && <p className="rounded-lg border border-border bg-background p-3 text-sm leading-6">{patient.notes}</p>}</div></section>
          </div>
        </TabsContent>

        <TabsContent value="chart" className="space-y-5">
          <PermanentArchViewer status={toothStatus} />
          <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
            <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Recorded findings" description="Conditions and completed care charted directly against FDI teeth." /><div className="mt-4 grid gap-2 sm:grid-cols-2">{clinical?.findings.map((finding) => <div key={finding.id} className="rounded-lg border border-border bg-background p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold"><span className="tnum text-primary">{finding.tooth_fdi}</span> · {finding.finding.replaceAll("_", " ")}</p><Badge variant="outline" className="capitalize">{finding.state}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{finding.surfaces.join("") || "Whole tooth"}{finding.note ? ` · ${finding.note}` : ""}</p></div>)}{clinical?.findings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground sm:col-span-2">No direct findings recorded yet.</p>}</div></section>
            <AddFinding patientId={patientId} disabled={!clinicalReady} onSaved={load} />
          </div>
        </TabsContent>

        <TabsContent value="visits"><section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="All confirmed visits" description="The original clinical record remains append-only." /><VisitList encounters={history.encounters} /></section></TabsContent>

        <TabsContent value="plan"><section className="space-y-3">{plans.map((plan) => <article key={plan.id} className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{plan.title}</h2><p className="mt-1 text-xs text-muted-foreground">{plan.diagnosis || "No diagnosis summary"}</p></div><Badge variant="outline" className="capitalize">{plan.status}</Badge></div><div className="mt-4 space-y-2">{(plan.items ?? []).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.tooth_fdi ? `${item.tooth_fdi} · ` : ""}{item.procedure_name}</p><p className="text-xs text-muted-foreground">Phase {item.phase} · {item.status.replaceAll("_", " ")}</p></div><p className="tnum text-sm font-semibold">{formatINR((item.quantity * item.unit_price_paise - item.discount_paise) / 100)}</p></div>)}</div></article>)}{plans.length === 0 && <EmptyPanel icon={ToothIcon} title="No treatment plan yet" detail="Create a phased plan from the Treatments workspace." action={<Button asChild><Link href={`/treatments?patient=${patientId}`}>Create treatment plan</Link></Button>} />}</section></TabsContent>

        <TabsContent value="imaging"><section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Imaging links" description="Secure HTTPS links only; imaging files remain in the clinic’s chosen system." /><div className="mt-4 grid gap-3 sm:grid-cols-2">{clinical?.imaging.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="pressable rounded-xl border border-border bg-background p-4 hover:border-primary/30"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{item.label}</p><Badge variant="outline" className="uppercase">{item.modality}</Badge></div><p className="mt-2 truncate text-xs text-muted-foreground">{item.url}</p></a>)}{clinical?.imaging.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground sm:col-span-2">No imaging links recorded.</p>}</div></section></TabsContent>

        <TabsContent value="documents"><PatientConsentsPanel patientId={patientId} /></TabsContent>
        <TabsContent value="finance"><EmptyPanel icon={ReceiptTextIcon} title="Patient finance" detail={`${formatINR(totalPlanned / 100)} currently planned. Estimates, invoices, payments and refunds are managed in Finance.`} action={<Button asChild><Link href="/finance">Open finance</Link></Button>} /></TabsContent>
      </Tabs>
    </PracticePage>
  );
}

function AddFinding({ patientId, disabled, onSaved }: { patientId: string; disabled: boolean; onSaved: () => Promise<void> }) {
  const [tooth, setTooth] = useState(""); const [finding, setFinding] = useState("caries"); const [surfaces, setSurfaces] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { const response = await fetch(`/api/patients/${patientId}/clinical`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "finding", toothFdi: Number(tooth), finding, surfaces: surfaces.toUpperCase().split("").filter(Boolean), note }) }); const body = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "Could not save the finding."); setTooth(""); setSurfaces(""); setNote(""); await onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the finding."); } finally { setSaving(false); } }
  return <form onSubmit={(event) => void submit(event)} className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5"><SectionHeading title="Chart a finding" description="Record what you observed; treatment remains a separate plan." /><div className="mt-4 grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="finding-tooth">FDI tooth</Label><Input id="finding-tooth" inputMode="numeric" placeholder="36" value={tooth} onChange={(event) => setTooth(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="finding-surfaces">Surfaces</Label><Input id="finding-surfaces" placeholder="MOD" value={surfaces} onChange={(event) => setSurfaces(event.target.value)} /></div></div><div className="mt-3 space-y-1.5"><Label htmlFor="finding-type">Finding</Label><select id="finding-type" value={finding} onChange={(event) => setFinding(event.target.value)} className="h-10 w-full rounded-lg border border-field-border bg-input px-3 text-sm"><option value="caries">Caries</option><option value="fracture">Fracture</option><option value="wear">Wear</option><option value="mobility">Mobility</option><option value="periapical">Periapical finding</option><option value="impacted">Impacted</option><option value="other">Other</option></select></div><div className="mt-3 space-y-1.5"><Label htmlFor="finding-note">Clinical note</Label><Textarea id="finding-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1500} /></div>{error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}<Button type="submit" className="mt-4 w-full" disabled={disabled || saving || !tooth}>{saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}Save finding</Button></form>;
}

function VisitList({ encounters }: { encounters: PatientHistoryPayload["encounters"] }) { return <div className="mt-4 space-y-2">{encounters.map((visit) => <article key={visit.id} className="rounded-xl border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{visit.diagnosis || "Clinical visit"}</p><p className="mt-1 text-xs text-muted-foreground">{visit.treatment || "No treatment summary"}</p></div><time className="tnum shrink-0 text-xs text-muted-foreground" dateTime={visit.occurred_at}>{shortDate(visit.occurred_at)}</time></div></article>)}{encounters.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No confirmed visits.</p>}</div>; }
function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="surface-card rounded-[1.15rem] bg-card p-4"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="tnum mt-2 text-2xl font-semibold tracking-[-0.05em]">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>; }
function EmptyPanel({ icon: Icon, title, detail, action }: { icon: typeof CalendarDaysIcon; title: string; detail: string; action?: ReactNode }) { return <div className="surface-card rounded-[1.35rem] bg-card px-6 py-14 text-center"><Icon className="mx-auto size-7 text-primary" aria-hidden /><h2 className="mt-4 text-base font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{detail}</p>{action && <div className="mt-5">{action}</div>}</div>; }
function shortDate(value: string): string { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
