"use client";

import type { CapturePhase, PatientMatch } from "@/hooks/use-voice-capture";
import { formatClock } from "@/lib/format";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 6;

export function OverviewView({
  doctorName,
  analytics,
  entries,
  dictationPhase,
  onStartDictation,
  onStopDictation,
  onManualEntry,
  onReviewNext,
  onOpenRegister,
  onOpenRecall,
  onOpenPatients,
  onOpenPatient,
}: {
  doctorName: string;
  analytics: AnalyticsPayload;
  entries: RegisterEntry[];
  dictationPhase: CapturePhase;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onManualEntry: () => void;
  onReviewNext: () => void;
  onOpenRegister: () => void;
  onOpenRecall: () => void;
  onOpenPatients: () => void;
  onOpenPatient: (patient: PatientMatch) => void;
}) {
  const recording = dictationPhase === "arming" || dictationPhase === "listening";
  const processing = dictationPhase === "transcribing" || dictationPhase === "extracting";
  const draftCount = entries.filter((entry) => entry.status === "draft").length;
  const committedCount = entries.filter((entry) => entry.status === "committed").length;

  return (
    <div className="clinical-home">
      <header className="clinical-home-header">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {todayLabel()}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            {greeting()}, {doctorName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Capture the consultation now. Check the clinical details before anything enters the patient record.
          </p>
        </div>
        <div className="hidden items-center gap-6 text-sm lg:flex" aria-label="Today at a glance">
          <div className="flex items-baseline gap-2">
            <strong className="tnum text-2xl font-semibold">{analytics.today?.patient_count ?? committedCount}</strong>
            <span className="text-muted-foreground">notes today</span>
          </div>
          <div className="flex items-baseline gap-2">
            <strong className={cn("tnum text-2xl font-semibold", draftCount > 0 && "text-warning")}>{draftCount}</strong>
            <span className="text-muted-foreground">need review</span>
          </div>
        </div>
      </header>

      <section className={cn("encounter-start", recording && "is-recording")} aria-labelledby="new-note-title">
        <div className="encounter-start-copy">
          <span className="encounter-step">New clinical note</span>
          <h2 id="new-note-title">What happened in the chair?</h2>
          <p>
            Say the patient, diagnosis, tooth and procedure naturally. You will review every extracted detail before saving.
          </p>
          <ol className="encounter-path" aria-label="Clinical note workflow">
            <li><span>1</span> Speak</li>
            <li><span>2</span> Review</li>
            <li><span>3</span> Confirm</li>
          </ol>
        </div>

        <div className="encounter-start-actions">
          <button
            type="button"
            onClick={recording ? onStopDictation : onStartDictation}
            disabled={processing}
            aria-pressed={recording}
            className={cn("clinical-record-button", recording && "is-live")}
          >
            <span className="clinical-record-button-icon">
              {recording ? (
                <span className="size-4 rounded-[0.2rem] bg-current" aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="8" y="3" width="8" height="12" rx="4" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
                </svg>
              )}
            </span>
            <span className="text-left">
              <strong>{processing ? "Preparing review…" : recording ? "Stop & review" : "Dictate a visit"}</strong>
              <small>{recording ? "Your note is being captured" : "Hindi, Punjabi or English"}</small>
            </span>
          </button>
          <button type="button" onClick={onManualEntry} className="clinical-manual-button">
            Type the note instead
          </button>
        </div>
      </section>

      <div className="clinical-work-grid">
        <section className="clinical-list" aria-labelledby="today-notes-title">
          <div className="clinical-section-heading">
            <div>
              <h2 id="today-notes-title">Today&rsquo;s clinical notes</h2>
              <p>{entries.length === 0 ? "No encounters recorded yet" : `${entries.length} encounter${entries.length === 1 ? "" : "s"}`}</p>
            </div>
            <button type="button" className="clinical-link-button" onClick={onOpenRegister}>
              Full register <span aria-hidden>→</span>
            </button>
          </div>

          {entries.length === 0 ? (
            <div className="clinical-empty">
              <span className="text-2xl" aria-hidden>∿</span>
              <div>
                <p>No notes for today</p>
                <span>Your first confirmed encounter will appear here.</span>
              </div>
            </div>
          ) : (
            <ol className="clinical-visit-list">
              {entries.slice(0, RECENT_LIMIT).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!entry.patient_id) return;
                      onOpenPatient({
                        id: entry.patient_id,
                        full_name: entry.patient_name,
                        phone: null,
                        age_years: entry.age_years,
                        last_visit: entry.occurred_at,
                        visit_count: entry.visit_number,
                      });
                    }}
                    disabled={!entry.patient_id}
                    className="clinical-visit-row"
                  >
                    <time dateTime={entry.occurred_at}>{formatClock(entry.occurred_at)}</time>
                    <span className={cn("clinical-visit-state", entry.status === "draft" && "is-draft")} aria-hidden>
                      {entry.status === "draft" ? "!" : "✓"}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <strong>{entry.patient_name}</strong>
                      <small>
                        {entry.procedures[0] || entry.diagnosis || entry.treatment || (entry.status === "draft" ? "Draft awaiting review" : "Clinical note")}
                      </small>
                    </span>
                    <span className={cn("clinical-status", entry.status === "draft" && "is-draft")}>
                      {entry.status === "draft" ? "Review" : "Saved"}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="clinical-actions" aria-labelledby="next-actions-title">
          <div className="clinical-section-heading">
            <div>
              <h2 id="next-actions-title">Next action</h2>
              <p>Move directly to the patient task.</p>
            </div>
          </div>

          <div className="clinical-action-list">
            {draftCount > 0 && (
              <button type="button" className="clinical-action-row" onClick={onReviewNext}>
                <span className="clinical-action-icon is-attention" aria-hidden>!</span>
                <span className="min-w-0 flex-1 text-left">
                  <strong>{`Review ${draftCount} unfinished note${draftCount === 1 ? "" : "s"}`}</strong>
                  <small>Confirm the clinical record before the next patient.</small>
                </span>
                <span className="text-muted-foreground" aria-hidden>→</span>
              </button>
            )}
            <button type="button" className="clinical-action-row" onClick={onOpenPatients}>
              <span className="clinical-action-icon" aria-hidden>P</span>
              <span className="min-w-0 flex-1 text-left">
                <strong>Open a patient chart</strong>
                <small>History, prescriptions and the dental arch.</small>
              </span>
              <span className="text-muted-foreground" aria-hidden>→</span>
            </button>
            <button type="button" className="clinical-action-row" onClick={onOpenRecall}>
              <span className="clinical-action-icon" aria-hidden>?</span>
              <span className="min-w-0 flex-1 text-left">
                <strong>Ask the register</strong>
                <small>Find a previous diagnosis, treatment or prescription.</small>
              </span>
              <span className="text-muted-foreground" aria-hidden>→</span>
            </button>
            <button type="button" className="clinical-action-row" onClick={onOpenRegister}>
              <span className="clinical-action-icon" aria-hidden>R</span>
              <span className="min-w-0 flex-1 text-left">
                <strong>Browse all encounters</strong>
                <small>Open confirmed notes and recover drafts.</small>
              </span>
              <span className="text-muted-foreground" aria-hidden>→</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}
