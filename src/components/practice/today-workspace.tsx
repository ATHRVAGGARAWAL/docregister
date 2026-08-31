"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowRightIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  ClipboardListIcon,
  Clock3Icon,
  SparklesIcon,
  ToothIcon,
  UserRoundIcon,
} from "@/components/icons";
import { MetricCard, PracticePage, PracticePageHeader, SectionHeading } from "@/components/practice/practice-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/practice/types";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";

export function TodayWorkspace({
  doctorName,
  analytics,
  entries,
}: {
  doctorName: string;
  analytics: AnalyticsPayload;
  entries: RegisterEntry[];
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scheduleReady, setScheduleReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    const controller = new AbortController();
    fetch(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("schedule unavailable");
        return response.json() as Promise<{ appointments?: Appointment[] }>;
      })
      .then((payload) => setAppointments(payload.appointments ?? []))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setScheduleReady(false);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const activeAppointments = appointments.filter((appointment) => !["cancelled", "no_show"].includes(appointment.status));
  const waiting = appointments.filter((appointment) => ["checked_in", "in_chair"].includes(appointment.status)).length;
  const drafts = entries.filter((entry) => entry.status === "draft").length;
  const next = useMemo(
    () => activeAppointments.find((appointment) => new Date(appointment.ends_at).getTime() >= openedAt),
    [activeAppointments, openedAt],
  );

  return (
    <PracticePage>
      <PracticePageHeader
        eyebrow="Clinic command centre"
        title={`Good ${dayPart()}, ${shortName(doctorName)}`}
        description="A single view of today’s chairs, clinical work and the records that need your attention."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/schedule"><CalendarPlusIcon aria-hidden />Book appointment</Link>
            </Button>
            <Button asChild>
              <Link href="/"><SparklesIcon aria-hidden />Start clinical note</Link>
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Today at a glance">
        <MetricCard label="Appointments" value={loading ? "—" : String(activeAppointments.length)} detail={next ? `Next at ${time(next.starts_at)}` : "No upcoming booking"} tone="primary" />
        <MetricCard label="Waiting / in chair" value={loading ? "—" : String(waiting)} detail="Live chair flow" tone={waiting > 0 ? "warning" : "default"} />
        <MetricCard label="Visits recorded" value={String(analytics.today?.patient_count ?? 0)} detail={`${analytics.today?.new_patients ?? 0} new · ${analytics.today?.returning_patients ?? 0} returning`} />
        <MetricCard label="Draft notes" value={String(drafts)} detail={drafts ? "Review before the day closes" : "Clinical notes are up to date"} tone={drafts ? "warning" : "default"} />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
        <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
          <SectionHeading
            title="Chair flow"
            description="Appointments are ordered by start time across every operatory."
            action={<Button asChild variant="ghost" size="sm"><Link href="/schedule">Full schedule<ArrowRightIcon aria-hidden /></Link></Button>}
          />
          <div className="mt-5">
            {!scheduleReady ? (
              <SetupNotice />
            ) : loading ? (
              <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">Loading today’s chairs…</div>
            ) : activeAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background px-5 py-10 text-center">
                <CalendarClockIcon className="mx-auto size-6 text-primary" aria-hidden />
                <p className="mt-3 text-sm font-semibold">No appointments booked today</p>
                <p className="mt-1 text-xs text-muted-foreground">Walk-ins and voice notes still appear in the clinical queue.</p>
                <Button asChild size="sm" className="mt-4"><Link href="/schedule">Add the first appointment</Link></Button>
              </div>
            ) : (
              <ol className="space-y-2">
                {activeAppointments.slice(0, 8).map((appointment) => (
                  <li key={appointment.id} className="grid grid-cols-[4.2rem_1fr_auto] items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
                    <time className="tnum text-sm font-semibold" dateTime={appointment.starts_at}>{time(appointment.starts_at)}</time>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{appointment.patient?.full_name ?? appointment.reason ?? "Reserved time"}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {appointment.appointment_type} · {appointment.operatory?.name ?? "Chair not assigned"}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
            <SectionHeading title="Quick actions" description="The common next steps, close at hand." />
            <div className="mt-4 grid gap-2">
              <QuickAction href="/patients" icon={UserRoundIcon} title="Open a patient chart" detail="History, alerts and dental chart" />
              <QuickAction href="/treatments" icon={ToothIcon} title="Review treatment plans" detail="Proposed and active care" />
              <QuickAction href="/operations" icon={ClipboardListIcon} title="Check lab and stock" detail="Cases due and low inventory" />
            </div>
          </section>

          <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
            <SectionHeading title="Recent clinical work" description="Latest saved visits from the register." />
            <div className="mt-4 space-y-3">
              {entries.slice(0, 4).map((entry) => (
                <article key={entry.id} className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Clock3Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.patient_name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{entry.procedures[0] ?? entry.diagnosis ?? "Clinical visit"}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{entry.status}</Badge>
                </article>
              ))}
              {entries.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No visits recorded today.</p>}
            </div>
          </section>
        </div>
      </div>
    </PracticePage>
  );
}

function QuickAction({ href, icon: Icon, title, detail }: { href: string; icon: typeof UserRoundIcon; title: string; detail: string }) {
  return (
    <Link href={href} className="pressable flex min-h-14 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 hover:border-primary/30">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
      <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  return <Badge variant="outline" className={status === "in_chair" ? "border-warning/30 bg-warning-soft text-warning" : status === "checked_in" ? "border-money/30 bg-money-soft text-money" : "capitalize"}>{status.replaceAll("_", " ")}</Badge>;
}

function SetupNotice() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background px-5 py-10 text-center">
      <CalendarPlusIcon className="mx-auto size-6 text-primary" aria-hidden />
      <p className="mt-3 text-sm font-semibold">Schedule is ready for clinic setup</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Once the new practice migrations are applied, appointments and chairs will appear here. The existing register remains fully available.</p>
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/^(dr\.?|prof\.?)\s+/i, "").split(/\s+/)[0] || "Doctor";
}

function dayPart(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function time(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(value));
}
