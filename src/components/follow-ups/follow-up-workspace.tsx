"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardClockIcon,
  Loader2Icon,
  PhoneIcon,
  PlusIcon,
  UserRoundIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

export function FollowUpWorkspace({
  initialPatientId,
  initialEncounterId,
  onCreated,
}: {
  initialPatientId?: string;
  initialEncounterId?: string;
  onCreated?: (followUp: FollowUpItem) => void;
}) {
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [patientId, setPatientId] = useState(initialPatientId ?? "");
  const encounterId = initialEncounterId ?? "";
  const [dueAt, setDueAt] = useState(() => defaultDueDate());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/follow-ups?status=open&limit=100", { cache: "no-store" });
      const payload = (await response.json()) as { followUps?: FollowUpItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load follow-ups.");
      setItems(payload.followUps ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load follow-ups.");
    } finally {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          encounterId: encounterId || undefined,
          dueAt: new Date(`${dueAt}T12:00:00+05:30`).toISOString(),
          reason,
          notes: notes || undefined,
          idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined,
        }),
      });
      const payload = (await response.json()) as { followUp?: FollowUpItem; error?: string };
      if (!response.ok || !payload.followUp) throw new Error(payload.error ?? "Could not schedule follow-up.");
      setItems((current) => [payload.followUp!, ...current]);
      setReason("");
      setNotes("");
      onCreated?.(payload.followUp);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not schedule follow-up.");
    } finally {
      setStatus("idle");
    }
  }

  async function complete(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/follow-ups/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as { followUp?: FollowUpItem; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not complete follow-up.");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete follow-up.");
    }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
      <Card className="glass-card gap-0 overflow-hidden rounded-[1.65rem] border-white/10 bg-card/50 py-0">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[0.95rem] border border-primary/20 bg-primary/10 text-primary shadow-[0_12px_26px_-18px_var(--primary)]">
                <ClipboardClockIcon className="size-4.5" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-base tracking-[-0.02em]">Follow-up queue</CardTitle>
                <CardDescription className="mt-1">Open recalls, ordered for the next patient touchpoint.</CardDescription>
              </div>
            </div>
            <span className="glass-inset tnum rounded-full px-2.5 py-1 text-[11px] font-semibold text-primary">{items.length} open</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {error && <Alert variant="destructive" role="alert" className="mb-4 rounded-[1rem]"><AlertTitle>Couldn’t update follow-ups</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {status === "loading" ? (
            <div className="grid min-h-52 place-items-center">
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden />Loading follow-ups…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="glass-inset grid min-h-52 place-items-center rounded-[1.25rem] border-dashed p-6 text-center">
              <div>
                <span className="mx-auto grid size-11 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-500"><CheckCircle2Icon className="size-5" aria-hidden /></span>
                <p className="mt-3 text-sm font-medium text-foreground">Queue is clear</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Schedule a return date after a visit and it will stay visible here until completed.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li key={item.id} className="glass-inset group relative overflow-hidden rounded-[1.2rem] p-4 transition-colors hover:border-primary/20">
                  <span className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-gradient-to-b from-primary to-primary/20" aria-hidden />
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[0.9rem] border border-white/10 bg-white/5 text-primary">
                      <UserRoundIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-[-0.015em]">{item.patient_name ?? "Patient"}</p>
                          <p className="mt-1 text-sm leading-5 text-foreground/90">{item.reason}</p>
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-emerald-500" onClick={() => void complete(item.id)}><CheckCircle2Icon className="size-3.5" aria-hidden />Complete</Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium text-primary"><CalendarDaysIcon className="size-3.5" aria-hidden />Due {formatDueDate(item.due_at)}</span>
                        {item.patient_phone && <span className="flex items-center gap-1.5"><PhoneIcon className="size-3.5" aria-hidden />{item.patient_phone}</span>}
                      </div>
                      {item.notes && <p className="mt-2 rounded-lg bg-white/4 px-2.5 py-2 text-xs leading-5 text-muted-foreground">{item.notes}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="glass-strong relative gap-0 overflow-hidden rounded-[1.65rem] border-white/10 bg-card/55 py-0 xl:sticky xl:top-5">
        <div className="ambient-orb pointer-events-none absolute -right-20 -top-20 size-44 opacity-45" aria-hidden />
        <CardHeader className="relative border-b border-white/8 px-5 py-5 sm:px-6">
          <span className="mb-3 grid size-10 place-items-center rounded-[0.95rem] border border-primary/20 bg-primary/12 text-primary shadow-[0_12px_26px_-18px_var(--primary)]"><PlusIcon className="size-4.5" aria-hidden /></span>
          <CardTitle className="text-base tracking-[-0.02em]">Schedule follow-up</CardTitle>
          <CardDescription className="mt-1 leading-5">Create a clear return cue tied to the patient and, when available, the confirmed visit.</CardDescription>
        </CardHeader>
        <CardContent className="relative p-5 sm:p-6">
          <form className="space-y-4" onSubmit={(event) => void createFollowUp(event)}>
            <div className="space-y-2"><Label htmlFor="follow-up-patient">Patient ID</Label><Input id="follow-up-patient" required value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder="Patient UUID" /></div>
            <div className="space-y-2"><Label htmlFor="follow-up-date">Due date</Label><Input id="follow-up-date" type="date" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="follow-up-reason">Reason</Label><Input id="follow-up-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review blood pressure" /></div>
            <div className="space-y-2"><Label htmlFor="follow-up-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="follow-up-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bring home readings" /></div>
            <Button type="submit" size="lg" className="w-full rounded-xl shadow-[0_14px_30px_-16px_var(--primary)]" disabled={status === "saving" || !patientId.trim()}>{status === "saving" ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <PlusIcon className="size-4" aria-hidden />}Schedule return</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function formatDueDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date not recorded";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date);
}
