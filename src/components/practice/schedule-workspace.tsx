"use client";

import { useCallback, useEffect, useState } from "react";

import { CalendarPlusIcon, ChevronRightIcon, LoaderCircleIcon, SearchIcon, UserRoundIcon } from "@/components/icons";
import { PracticePage, PracticePageHeader, SectionHeading } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import type { Appointment, AppointmentStatus, Operatory } from "@/lib/practice/types";
import { cn } from "@/lib/utils";

interface Clinician { id: string; full_name: string; speciality: string | null; practice_role: string }

export function ScheduleWorkspace() {
  const [day, setDay] = useState(() => localDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [operatories, setOperatories] = useState<Operatory[]>([]);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = new Date(`${day}T00:00:00`);
    const to = new Date(`${day}T00:00:00`);
    to.setDate(to.getDate() + 1);
    try {
      const response = await fetch(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      const body = await response.json().catch(() => null) as { error?: string; appointments?: Appointment[]; operatories?: Operatory[]; clinicians?: Clinician[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not load the schedule.");
      setAppointments(body?.appointments ?? []);
      setOperatories(body?.operatories ?? []);
      setClinicians(body?.clinicians ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const active = appointments.filter((item) => !["cancelled", "no_show"].includes(item.status));
  const chairs = operatories.length ? operatories : [{ id: "unassigned", name: "Unassigned", code: null, colour: "#6b7280", sort_order: 0, is_active: true }];

  return (
    <PracticePage>
      <PracticePageHeader
        eyebrow="Multi-chair planning"
        title="Schedule"
        description="Run the day by chair, clinician and patient status without leaving the clinical workspace."
        actions={<Button onClick={() => setNewOpen(true)}><CalendarPlusIcon aria-hidden />New appointment</Button>}
      />

      <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading title={longDay(day)} description={`${active.length} active appointment${active.length === 1 ? "" : "s"}`} />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}>‹</Button>
            <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="w-[10rem]" aria-label="Schedule date" />
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))}>›</Button>
            <Button variant="ghost" onClick={() => setDay(localDay(new Date()))}>Today</Button>
          </div>
        </div>

        {error && <Alert variant="destructive" className="mt-4"><AlertTitle>Schedule unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="mt-5 overflow-x-auto pb-2">
          <div className="grid min-w-[52rem] gap-3" style={{ gridTemplateColumns: `repeat(${chairs.length}, minmax(15rem, 1fr))` }}>
            {chairs.map((chair) => {
              const chairAppointments = active.filter((item) => (item.operatory_id ?? "unassigned") === chair.id);
              return (
                <section key={chair.id} className="rounded-xl border border-border bg-background">
                  <header className="flex items-center justify-between border-b border-border px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: chair.colour }} aria-hidden />
                      <h2 className="text-sm font-semibold">{chair.name}</h2>
                    </div>
                    <Badge variant="outline">{chairAppointments.length}</Badge>
                  </header>
                  <div className="min-h-[28rem] space-y-2 p-2.5">
                    {loading && <p className="px-2 py-8 text-center text-sm text-muted-foreground">Loading…</p>}
                    {!loading && chairAppointments.length === 0 && <p className="px-3 py-10 text-center text-xs leading-5 text-muted-foreground">No appointments assigned to this chair.</p>}
                    {chairAppointments.map((appointment) => (
                      <AppointmentCard key={appointment.id} appointment={appointment} onChanged={load} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <NewAppointmentSheet
        key={day}
        open={newOpen}
        onOpenChange={setNewOpen}
        day={day}
        operatories={operatories}
        clinicians={clinicians}
        onCreated={async () => { setNewOpen(false); await load(); }}
      />
    </PracticePage>
  );
}

function AppointmentCard({ appointment, onChanged }: { appointment: Appointment; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function advance(status: AppointmentStatus) {
    setSaving(true);
    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("Could not update the appointment.");
      await onChanged();
    } finally {
      setSaving(false);
    }
  }
  const next: Partial<Record<AppointmentStatus, AppointmentStatus>> = { scheduled: "confirmed", confirmed: "checked_in", checked_in: "in_chair", in_chair: "completed" };
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-flat">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tnum text-xs font-semibold text-primary">{time(appointment.starts_at)}–{time(appointment.ends_at)}</p>
          <h3 className="mt-1 truncate text-sm font-semibold">{appointment.patient?.full_name ?? appointment.reason ?? "Reserved time"}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{appointment.appointment_type} · {appointment.clinician?.full_name ?? "Clinician unassigned"}</p>
        </div>
        <Badge variant="outline" className={statusClass(appointment.status)}>{appointment.status.replaceAll("_", " ")}</Badge>
      </div>
      {next[appointment.status] && (
        <Button variant="outline" size="sm" className="mt-3 w-full" disabled={saving} onClick={() => void advance(next[appointment.status]!)}>
          {saving ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <ChevronRightIcon aria-hidden />}
          Mark {next[appointment.status]!.replaceAll("_", " ")}
        </Button>
      )}
    </article>
  );
}

function NewAppointmentSheet({ open, onOpenChange, day, operatories, clinicians, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; day: string; operatories: Operatory[]; clinicians: Clinician[]; onCreated: () => Promise<void> }) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [patient, setPatient] = useState<PatientMatch | null>(null);
  const [start, setStart] = useState(`${day}T09:00`);
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("consultation");
  const [operatoryId, setOperatoryId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (patient || patientQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(patientQuery.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
        .then((body: { patients?: PatientMatch[] }) => setPatients(body.patients?.slice(0, 6) ?? []))
        .catch(() => setPatients([]));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [patient, patientQuery]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const startsAt = new Date(start);
      const endsAt = new Date(startsAt.getTime() + Number(duration) * 60_000);
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient?.id, clinicianId: clinicianId || undefined, operatoryId: operatoryId || undefined, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), appointmentType: type, reason: reason || undefined }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not schedule the appointment.");
      setPatient(null); setPatientQuery(""); setReason("");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not schedule the appointment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-card sm:max-w-lg">
        <SheetHeader><SheetTitle>New appointment</SheetTitle><SheetDescription>Reserve a chair and clinician. Internal reminders stay inside Docregister.</SheetDescription></SheetHeader>
        <form className="space-y-5 px-4 pb-8 sm:px-6" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="appointment-patient">Patient</Label>
            {patient ? (
              <button type="button" onClick={() => setPatient(null)} className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft px-3 text-left">
                <UserRoundIcon className="size-4 text-primary" aria-hidden /><span className="flex-1 text-sm font-semibold">{patient.full_name}</span><span className="text-xs text-muted-foreground">Change</span>
              </button>
            ) : (
              <>
                <div className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="appointment-patient" value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Search patient name or phone" className="pl-9" /></div>
                {patients.length > 0 && <div className="overflow-hidden rounded-lg border border-border">{patients.map((match) => <button key={match.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-border px-3 text-left text-sm last:border-0 hover:bg-secondary" onClick={() => { setPatient(match); setPatients([]); }}><span className="font-medium">{match.full_name}</span><span className="text-xs text-muted-foreground">{match.phone ?? "No phone"}</span></button>)}</div>}
              </>
            )}
          </div>
          <div className="space-y-2"><Label htmlFor="appointment-reason">Reason or reserved block</Label><Input id="appointment-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. RCT sitting 2, emergency, lunch" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="appointment-start">Starts</Label><Input id="appointment-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="appointment-duration">Minutes</Label><Input id="appointment-duration" type="number" min="10" max="720" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="appointment-type">Appointment type</Label><Input id="appointment-type" value={type} onChange={(event) => setType(event.target.value)} maxLength={80} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="appointment-chair">Chair</Label><select id="appointment-chair" value={operatoryId} onChange={(event) => setOperatoryId(event.target.value)} className="h-10 w-full rounded-lg border border-field-border bg-input px-3 text-sm"><option value="">Unassigned</option>{operatories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="appointment-clinician">Clinician</Label><select id="appointment-clinician" value={clinicianId} onChange={(event) => setClinicianId(event.target.value)} className="h-10 w-full rounded-lg border border-field-border bg-input px-3 text-sm"><option value="">Current dentist</option>{clinicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={saving || (!patient && !reason.trim())}>{saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}Schedule appointment</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDay(day: string, amount: number): string { const date = new Date(`${day}T12:00:00+05:30`); date.setDate(date.getDate() + amount); return localDay(date); }
function longDay(day: string): string { return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${day}T12:00:00+05:30`)); }
function time(value: string): string { return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(value)); }
function statusClass(status: AppointmentStatus): string { return cn("capitalize", status === "in_chair" && "border-warning/30 bg-warning-soft text-warning", status === "checked_in" && "border-money/30 bg-money-soft text-money", status === "completed" && "border-primary/25 bg-primary-soft text-primary"); }
