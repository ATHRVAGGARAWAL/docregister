"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClipboardClockIcon,
  ClipboardListIcon,
  CalendarClockIcon,
  LoaderCircleIcon,
  Mic,
  PlusIcon,
  UsersRoundIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { AppView } from "@/components/dashboard/app-navigation";
import type { CapturePhase, PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock, formatCount, formatVisitDay } from "@/lib/format";
import type { Appointment } from "@/lib/practice/types";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";
import {
  APPOINTMENT_LABELS,
  clinicDay,
  clinicDayWindow,
} from "@/lib/workspace";

interface FollowUp {
  id: string;
  due_at: string;
  patient_name?: string;
  reason: string;
}
interface Drafts {
  entries: RegisterEntry[];
  draftCount: number;
}
type Resource<T> = { data: T | null; error: boolean };
const pending = { data: null, error: false };

export function OverviewView({
  doctorName,
  analytics,
  entries,
  dictationPhase,
  onStartDictation,
  onStopDictation,
  onManualEntry,
  onNavigate,
  onOpenDraft,
  onOpenVisit,
  onOpenPatient,
  onReviewAll,
}: {
  doctorName: string;
  analytics: AnalyticsPayload;
  entries: RegisterEntry[];
  dictationPhase: CapturePhase;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onManualEntry: () => void;
  onNavigate: (view: AppView) => void;
  onOpenDraft: (entry: RegisterEntry) => void;
  onOpenVisit: (entry: RegisterEntry) => void;
  onOpenPatient: (patient: PatientMatch) => void;
  onReviewAll: () => void;
}) {
  const [appointments, setAppointments] =
    useState<Resource<Appointment[]>>(pending);
  const [followUps, setFollowUps] = useState<Resource<FollowUp[]>>(pending);
  const [drafts, setDrafts] = useState<Resource<Drafts>>(pending);
  const [retry, setRetry] = useState(0);
  const day = clinicDay();

  useEffect(() => {
    const controller = new AbortController();
    const window = clinicDayWindow(day);
    const read = async <T,>(
      url: string,
      select: (body: T) => void,
      fail: () => void,
    ) => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Workspace request failed");
        const body = (await response.json()) as T;
        if (!controller.signal.aborted) select(body);
      } catch {
        if (!controller.signal.aborted) fail();
      }
    };
    void Promise.all([
      read<{ appointments: Appointment[] }>(
        `/api/appointments?${new URLSearchParams(window)}`,
        (body) => setAppointments({ data: body.appointments, error: false }),
        () => setAppointments({ data: null, error: true }),
      ),
      read<{ followUps: FollowUp[] }>(
        "/api/follow-ups?status=open&limit=200",
        (body) =>
          setFollowUps({
            data: body.followUps
              .filter((item) => clinicDay(item.due_at) <= day)
              .sort((a, b) => a.due_at.localeCompare(b.due_at)),
            error: false,
          }),
        () => setFollowUps({ data: null, error: true }),
      ),
      read<Drafts>(
        "/api/register?days=365&status=draft&limit=4&offset=0",
        (body) => setDrafts({ data: body, error: false }),
        () => setDrafts({ data: null, error: true }),
      ),
    ]);
    return () => controller.abort();
  }, [day, entries, retry]);

  const recording =
    dictationPhase === "arming" || dictationPhase === "listening";
  const processing =
    dictationPhase === "transcribing" || dictationPhase === "extracting";
  const active = appointments.data?.filter(
    (item) => !["cancelled", "no_show"].includes(item.status),
  );
  const upcoming = active
    ?.filter((item) => item.status !== "completed")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const saved = entries.filter((entry) => entry.status === "committed");
  const draftCount = drafts.data?.draftCount;
  const dueCount = followUps.data?.length;

  return (
    <div className="workspace-home">
      <header className="workspace-heading">
        <div>
          <p className="workspace-eyebrow">
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Kolkata",
            }).format(new Date())}
          </p>
          <h1>Today</h1>
          <p>Welcome back, {doctorName}. Here is what needs your attention.</p>
        </div>
        <Button variant="outline" onClick={() => onNavigate("schedule")}>
          <CalendarDaysIcon aria-hidden />
          Open schedule
        </Button>
      </header>

      <div className="workspace-metrics" aria-label="Today at a glance">
        <Metric
          label="Appointments today"
          value={active?.length}
          error={appointments.error}
          detail="View the daily schedule"
          icon={CalendarDaysIcon}
          onClick={() => onNavigate("schedule")}
        />
        <Metric
          label="Visits completed"
          value={analytics.today?.patient_count ?? saved.length}
          detail="Open your patient register"
          icon={CheckIcon}
          onClick={() => onNavigate("register")}
        />
        <Metric
          label="Awaiting review"
          value={draftCount}
          error={drafts.error}
          detail="Unfinished visits · past 12 months"
          icon={ClipboardListIcon}
          onClick={onReviewAll}
          attention={Boolean(draftCount)}
        />
        <Metric
          label="Follow-ups due"
          atLeast={dueCount === 200}
          value={dueCount}
          error={followUps.error}
          detail="Due today or overdue"
          icon={ClipboardClockIcon}
          onClick={() => onNavigate("follow-ups")}
          attention={Boolean(dueCount)}
        />
      </div>

      <div className="workspace-columns">
        <div className="workspace-stack">
          <section
            className="workspace-panel"
            aria-labelledby="schedule-heading"
          >
            <PanelHeading
              id="schedule-heading"
              title="Today’s appointments"
              description={
                upcoming
                  ? `${upcoming.length} still to see`
                  : "Your clinic’s schedule"
              }
              action="View schedule"
              onClick={() => onNavigate("schedule")}
            />
            {appointments.error ? (
              <LoadFailure
                label="appointments"
                onRetry={() => setRetry((value) => value + 1)}
              />
            ) : !upcoming ? (
              <Loading />
            ) : upcoming.length === 0 ? (
              <Empty
                icon={CalendarDaysIcon}
                title={
                  active?.length
                    ? "All appointments completed"
                    : "Your schedule is clear"
                }
                description="Book an appointment, or start a visit for a walk-in patient."
                action="Open schedule"
                onClick={() => onNavigate("schedule")}
              />
            ) : (
              <ol className="workspace-rows">
                {upcoming.slice(0, 5).map((appointment) => (
                  <li key={appointment.id}>
                    <button
                      className="workspace-appointment"
                      onClick={() =>
                        appointment.patient
                          ? onOpenPatient({
                              ...appointment.patient,
                              age_years: null,
                              last_visit: null,
                              visit_count: null,
                            })
                          : onNavigate("schedule")
                      }
                    >
                      <span className="workspace-time">
                        <strong>{formatClock(appointment.starts_at)}</strong>
                        <small>
                          {Math.round(
                            (Date.parse(appointment.ends_at) -
                              Date.parse(appointment.starts_at)) /
                              60000,
                          )}{" "}
                          min
                        </small>
                      </span>
                      <span className="workspace-row-copy">
                        <strong>
                          {appointment.patient?.full_name ??
                            appointment.reason ??
                            "Reserved time"}
                        </strong>
                        <small>
                          {appointment.reason || appointment.appointment_type}
                          {appointment.operatory
                            ? ` · ${appointment.operatory.name}`
                            : ""}
                        </small>
                      </span>
                      <span
                        className={`workspace-status ${["checked_in", "in_chair"].includes(appointment.status) ? "is-attention" : ""}`}
                      >
                        {APPOINTMENT_LABELS[appointment.status]}
                      </span>
                      <ArrowRightIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="workspace-panel" aria-labelledby="recent-heading">
            <PanelHeading
              id="recent-heading"
              title="Recent visits"
              description="Confirmed in your register today"
              action="View register"
              onClick={() => onNavigate("register")}
            />
            {saved.length === 0 ? (
              <Empty
                icon={ClipboardListIcon}
                title="Ready for your first visit"
                description="Confirmed visits appear here. Unfinished notes stay in the review queue."
              />
            ) : (
              <ol className="workspace-rows">
                {saved.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <button
                      className="workspace-appointment"
                      onClick={() => onOpenVisit(entry)}
                    >
                      <span className="workspace-initials" aria-hidden>
                        {initials(entry.patient_name)}
                      </span>
                      <span className="workspace-row-copy">
                        <strong>{entry.patient_name}</strong>
                        <small>
                          {entry.procedures[0] ||
                            entry.diagnosis ||
                            entry.treatment ||
                            "Consultation"}
                        </small>
                      </span>
                      <time
                        className="text-xs text-muted-foreground"
                        dateTime={entry.occurred_at}
                      >
                        {formatClock(entry.occurred_at)}
                      </time>
                      <ArrowRightIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="workspace-stack">
          <section
            className="workspace-panel workspace-start"
            aria-labelledby="start-heading"
          >
            <span className="workspace-start-icon">
              <PlusIcon aria-hidden />
            </span>
            <h2 id="start-heading">Start a visit</h2>
            <p>Select a patient, add your notes, then review and confirm.</p>
            <Button
              className="w-full"
              size="lg"
              onClick={onManualEntry}
              disabled={recording || processing}
            >
              <PlusIcon aria-hidden />
              New visit
            </Button>
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={recording ? onStopDictation : onStartDictation}
              disabled={processing}
              aria-label={
                processing
                  ? "Preparing review"
                  : recording
                    ? "Stop dictation"
                    : "Start recording a visit"
              }
              aria-pressed={recording}
            >
              {processing ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden />
              ) : (
                <Mic aria-hidden />
              )}
              {processing
                ? "Preparing review…"
                : recording
                  ? "Stop & review"
                  : "Dictate a visit"}
            </Button>
            <small>Dictation supports Hindi, Punjabi and English.</small>
          </section>

          <section
            className="workspace-panel"
            aria-labelledby="attention-heading"
          >
            <PanelHeading
              id="attention-heading"
              title="Needs attention"
              description="Pick up where you left off"
            />
            <div className="workspace-attention">
              <div className="workspace-mini-heading">
                <ClipboardListIcon aria-hidden />
                <h3>Unfinished visits</h3>
                {draftCount !== undefined && (
                  <span>{formatCount(draftCount)}</span>
                )}
              </div>
              {drafts.error ? (
                <LoadFailure
                  label="drafts"
                  onRetry={() => setRetry((value) => value + 1)}
                />
              ) : !drafts.data ? (
                <Loading />
              ) : draftCount === 0 ? (
                <p className="workspace-clear">
                  <CheckIcon aria-hidden />
                  All visit notes are reviewed.
                </p>
              ) : (
                <ul>
                  {drafts.data.entries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        className="workspace-task"
                        onClick={() => onOpenDraft(entry)}
                      >
                        <span>
                          <strong>{entry.patient_name}</strong>
                          <small>
                            {formatVisitDay(entry.occurred_at)} · Draft
                          </small>
                        </span>
                        <span className="workspace-task-action">
                          Review <ArrowRightIcon aria-hidden />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {draftCount !== undefined && draftCount > 4 && (
                <button className="workspace-text-link" onClick={onReviewAll}>
                  View all {draftCount} drafts <ArrowRightIcon aria-hidden />
                </button>
              )}
              <div className="workspace-mini-heading border-t border-border pt-4">
                <CalendarClockIcon aria-hidden />
                <h3>Follow-ups due</h3>
                {dueCount !== undefined && (
                  <span>
                    {dueCount}
                    {dueCount === 200 ? "+" : ""}
                  </span>
                )}
              </div>
              {followUps.error ? (
                <LoadFailure
                  label="follow-ups"
                  onRetry={() => setRetry((value) => value + 1)}
                />
              ) : !followUps.data ? (
                <Loading />
              ) : dueCount === 0 ? (
                <p className="workspace-clear">
                  <CheckIcon aria-hidden />
                  No follow-ups due today.
                </p>
              ) : (
                <ul>
                  {followUps.data.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <button
                        className="workspace-task"
                        onClick={() => onNavigate("follow-ups")}
                      >
                        <span>
                          <strong>
                            {item.patient_name || "Patient follow-up"}
                          </strong>
                          <small>
                            {item.reason} ·{" "}
                            {clinicDay(item.due_at) < day ? "Overdue" : "Today"}
                          </small>
                        </span>
                        <ArrowRightIcon
                          className="size-4 shrink-0"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <button
            className="workspace-directory-link"
            onClick={() => onNavigate("patients")}
          >
            <UsersRoundIcon aria-hidden />
            <span>Find a patient or open their chart</span>
            <ArrowRightIcon aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  error,
  detail,
  icon: Icon,
  onClick,
  attention,
  atLeast,
}: {
  label: string;
  value?: number;
  error?: boolean;
  detail: string;
  icon: typeof CalendarDaysIcon;
  onClick: () => void;
  attention?: boolean;
  atLeast?: boolean;
}) {
  return (
    <button
      className={`workspace-metric ${attention ? "is-attention" : ""}`}
      onClick={onClick}
    >
      <span className="workspace-metric-label">
        {label}
        <Icon aria-hidden />
      </span>
      <strong>
        {error ? (
          "—"
        ) : value === undefined ? (
          <span className="workspace-metric-loading" aria-label="Loading" />
        ) : (
          `${formatCount(value)}${atLeast ? "+" : ""}`
        )}
      </strong>
      <small>{error ? "Unavailable · open to retry" : detail}</small>
    </button>
  );
}
function PanelHeading({
  id,
  title,
  description,
  action,
  onClick,
}: {
  id: string;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="workspace-panel-heading">
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {action && (
        <button className="workspace-text-link" onClick={onClick}>
          {action}
          <ArrowRightIcon aria-hidden />
        </button>
      )}
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: typeof CalendarDaysIcon;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="workspace-empty">
      <span>
        <Icon aria-hidden />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
function Loading() {
  return (
    <p className="workspace-loading" role="status">
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
      Loading…
    </p>
  );
}
function LoadFailure({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="workspace-load-error" role="status">
      <p>Could not load {label}.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
