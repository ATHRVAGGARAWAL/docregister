"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ArrowRightIcon, CalendarClockIcon, SearchIcon, UsersRoundIcon } from "@/components/icons";
import { PracticePage, PracticePageHeader } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { PatientMatch } from "@/hooks/use-voice-capture";
import { maskPhone } from "@/lib/format";

export function PatientsWorkspace() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  useEffect(() => {
    const current = ++ticket.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/patients${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, { signal: controller.signal });
        const body = await response.json().catch(() => null) as { error?: string; patients?: PatientMatch[]; totalCount?: number } | null;
        if (!response.ok) throw new Error(body?.error ?? "Could not load patients.");
        if (current !== ticket.current) return;
        setPatients(body?.patients ?? []);
        setTotal(body?.totalCount ?? 0);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (current === ticket.current) setError(caught instanceof Error ? caught.message : "Could not load patients.");
      } finally {
        if (current === ticket.current) setLoading(false);
      }
    }, query ? 280 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  return (
    <PracticePage>
      <PracticePageHeader
        eyebrow="Clinical records"
        title="Patients"
        description="Open the whole chart—not just the last visit—with alerts, 3D dentition, treatment and finance in one workspace."
      />

      <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Patient directory</h2>
            <p className="mt-1 text-xs text-muted-foreground">{loading ? "Refreshing…" : `${total} chart${total === 1 ? "" : "s"}`}</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or phone" aria-label="Search patients" className="pl-9" />
          </div>
        </div>

        {error && <Alert variant="destructive" className="mt-4"><AlertTitle>Could not load patients</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {patients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`} className="pressable group flex min-h-40 flex-col rounded-[1.15rem] border border-border bg-background p-4 hover:border-primary/30">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-semibold text-primary" aria-hidden>{initials(patient.full_name)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{patient.full_name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{patient.age_years == null ? "Age not recorded" : `${patient.age_years} years`} · {maskPhone(patient.phone) ?? "No phone"}</span></span>
                <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                <span><span className="tnum block text-2xl font-semibold tracking-[-0.05em]">{patient.visit_count ?? 0}</span><span className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Visits</span></span>
                <Badge variant="outline" className="max-w-[11rem] truncate"><CalendarClockIcon className="size-3" aria-hidden />{patient.last_visit ? shortDate(patient.last_visit) : "No visits"}</Badge>
              </div>
            </Link>
          ))}
        </div>

        {!loading && patients.length === 0 && !error && (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
            {query ? <SearchIcon className="mx-auto size-6 text-primary" aria-hidden /> : <UsersRoundIcon className="mx-auto size-6 text-primary" aria-hidden />}
            <p className="mt-3 text-sm font-semibold">{query ? `No charts match “${query.trim()}”` : "No patient charts yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{query ? "Try a different spelling or phone number." : "A chart appears after the first confirmed clinical note."}</p>
          </div>
        )}
      </section>
    </PracticePage>
  );
}

function initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PT"; }
function shortDate(value: string): string { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
