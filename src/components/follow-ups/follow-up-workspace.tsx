"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2Icon, ClipboardClockIcon, Loader2Icon, PlusIcon } from "lucide-react";

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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardClockIcon className="size-4 text-primary" aria-hidden />Follow-up queue</CardTitle>
          <CardDescription>Open recalls stay visible until someone marks them complete.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Alert variant="destructive" className="mb-4"><AlertTitle>Couldn’t update follow-ups</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {status === "loading" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden />Loading follow-ups…</p> : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No open follow-ups. Schedule one after a visit when a patient needs a return date.</p> : <ul className="divide-y divide-border">{items.map((item) => <li key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0"><div className="min-w-0"><p className="font-medium">{item.patient_name ?? "Patient"}</p><p className="mt-1 text-sm text-foreground">{item.reason}</p><p className="mt-1 text-xs text-muted-foreground">Due {formatDueDate(item.due_at)}{item.notes ? ` · ${item.notes}` : ""}</p></div><Button type="button" size="sm" variant="outline" onClick={() => void complete(item.id)}><CheckCircle2Icon className="size-4" aria-hidden />Complete</Button></li>)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><PlusIcon className="size-4 text-primary" aria-hidden />Schedule follow-up</CardTitle><CardDescription>Use the patient id from the confirmed chart. A follow-up can be tied to the saved visit.</CardDescription></CardHeader>
        <CardContent><form className="space-y-4" onSubmit={(event) => void createFollowUp(event)}><div className="space-y-2"><Label htmlFor="follow-up-patient">Patient ID</Label><Input id="follow-up-patient" required value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder="Patient UUID" /></div><div className="space-y-2"><Label htmlFor="follow-up-date">Due date</Label><Input id="follow-up-date" type="date" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="follow-up-reason">Reason</Label><Input id="follow-up-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review blood pressure" /></div><div className="space-y-2"><Label htmlFor="follow-up-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="follow-up-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bring home readings" /></div><Button type="submit" disabled={status === "saving" || !patientId.trim()}>{status === "saving" ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <PlusIcon className="size-4" aria-hidden />}Schedule</Button></form></CardContent>
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
