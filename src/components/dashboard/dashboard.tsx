"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheckIcon, CalendarDaysIcon } from "lucide-react";

import { AppNavigation, type AppView } from "@/components/dashboard/app-navigation";
import { OverviewView } from "@/components/dashboard/overview-view";
import { RecallWorkspace } from "@/components/dashboard/recall-workspace";
import { patientFromRecall, type RecallResult } from "@/components/dashboard/recall-panel";
import { RegisterWorkspace } from "@/components/dashboard/register-workspace";
import { VisitDetailSheet } from "@/components/dashboard/visit-detail-sheet";
import {
  SettingsWorkspace,
  type DoctorProfile,
} from "@/components/dashboard/settings-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { PatientDirectory } from "@/components/patients/patient-directory";
import { PatientHistorySheet } from "@/components/patients/patient-history-sheet";
import { ReviewSheet } from "@/components/voice/review-sheet";
import { VoiceDock } from "@/components/voice/voice-dock";
import {
  type CaptureDraft,
  type CaptureTranscript,
  type PatientMatch,
  useVoiceCapture,
} from "@/hooks/use-voice-capture";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const viewTitles: Record<AppView, string> = {
  overview: "Overview",
  register: "Patient register",
  patients: "Patient directory",
  recall: "Patient recall",
  settings: "Account & settings",
};

type RegisterStatus = "all" | "committed" | "draft";

/** The register opens on a month; the Today chip narrows it. */
const DEFAULT_REGISTER_DAYS = 30;

export function Dashboard({
  initialProfile,
  initialAnalytics,
  initialEntries,
  liveProxyUrl,
}: {
  initialProfile: DoctorProfile;
  initialAnalytics: AnalyticsPayload;
  initialEntries: RegisterEntry[];
  liveProxyUrl: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<AppView>(() => initialUrlState().view);
  const [profile, setProfile] = useState(initialProfile);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [range, setRange] = useState(30);
  const [loadingRange, setLoadingRange] = useState(false);
  const [accessToken, setAccessToken] = useState<string | undefined>();

  const [question, setQuestion] = useState<string | null>(null);
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [recallLoading, setRecallLoading] = useState(false);
  /**
   * The recording the question on screen came from, when it was spoken.
   *
   * Held here rather than read off `capture` at the moment it is needed,
   * because the doctor can start a second recording while the first one's
   * answer is still on screen — and "Record as a visit instead" must then file
   * the utterance the panel is showing, not whatever the microphone heard last.
   * Null whenever the question was typed, which is what hides the action.
   */
  const [spokenQuestion, setSpokenQuestion] = useState<CaptureTranscript | null>(null);

  const [registerEntries, setRegisterEntries] = useState(initialEntries);
  const [registerDays, setRegisterDays] = useState(() => initialUrlState().days);
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>(() => initialUrlState().status);
  const [registerQuery, setRegisterQuery] = useState(() => initialUrlState().query);
  const [registerOffset, setRegisterOffset] = useState(() => initialUrlState().offset);
  const registerLimit = 50;
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerTotals, setRegisterTotals] = useState({
    count: 0,
    fees: 0,
    committedCount: initialEntries.filter((entry) => entry.status === "committed").length,
    committedFees: initialEntries.filter((entry) => entry.status === "committed").reduce((sum, entry) => sum + (entry.fees_inr ?? 0), 0),
    draftCount: initialEntries.filter((entry) => entry.status === "draft").length,
    draftFees: initialEntries.filter((entry) => entry.status === "draft").reduce((sum, entry) => sum + (entry.fees_inr ?? 0), 0),
  });
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [chartPatient, setChartPatient] = useState<PatientMatch | null>(null);
  const [visitDetailId, setVisitDetailId] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<CaptureDraft | null>(null);
  const [discardedDraftId, setDiscardedDraftId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // The directory is a page of the clinic's charts plus the honest size of the
  // result, kept apart so the workspace can say "showing 50 of 214" rather than
  // labelling the page with the total.
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [patientsTotal, setPatientsTotal] = useState(0);
  const [patientsQuery, setPatientsQuery] = useState("");
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const capture = useVoiceCapture({
    accessToken,
    liveProxyUrl,
    languages: profile.dictationLangs,
    // The recording was a question, so it never became a draft. Ask it, and
    // keep hold of the recording it came from so the panel can offer the way
    // back to a visit if the classifier got that wrong.
    onQuestion: (spoken) => {
      setSpokenQuestion(spoken);
      void ask(spoken.text);
    },
  });

  useEffect(() => {
    let cancelled = false;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAccessToken(data.session?.access_token);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One counter per fetcher. Clicking 7 days then 90 days fires two requests,
  // and without this whichever the network happens to return last wins — so the
  // chart could settle on 7 days' data while the 90-day chip stayed highlighted,
  // indefinitely. Comparing a captured ticket against the latest before writing
  // state means a superseded response is dropped instead of applied.
  const rangeTicket = useRef(0);
  const registerTicket = useRef(0);
  const recallTicket = useRef(0);
  // The directory needs this most of all: it is searched by a debounced box, so
  // "sun" and "sunita" are two requests in flight over one list.
  const patientsTicket = useRef(0);
  // Whether the register workspace has fetched once this session.
  const registerLoaded = useRef(false);
  const patientsLoaded = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "overview") params.set("view", view);
    if (view === "register") {
      params.set("days", String(registerDays));
      if (registerStatus !== "all") params.set("status", registerStatus);
      if (registerQuery.trim()) params.set("q", registerQuery.trim());
      if (registerOffset > 0) params.set("offset", String(registerOffset));
    }
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [registerDays, registerOffset, registerQuery, registerStatus, view]);

  const loadRange = useCallback(async (days: number) => {
    const ticket = ++rangeTicket.current;
    setRange(days);
    setLoadingRange(true);
    setAnalyticsError(null);
    try {
      const payload = await getJson(`/api/analytics/daily?days=${days}`);
      if (ticket !== rangeTicket.current) return;
      setAnalytics(payload as AnalyticsPayload);
    } catch (error) {
      if (ticket !== rangeTicket.current) return;
      // Previously this had no failure branch at all: the spinner stopped, the
      // old numbers stayed on screen, and nothing said they were stale.
      setAnalyticsError(messageFor(error, "Could not load analytics."));
    } finally {
      if (ticket === rangeTicket.current) setLoadingRange(false);
    }
  }, []);

  const loadRegister = useCallback(async (days: number, status: RegisterStatus, query: string, offset = 0) => {
    const ticket = ++registerTicket.current;
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      const params = new URLSearchParams({ days: String(days), limit: String(registerLimit), offset: String(offset) });
      if (status !== "all") params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const payload = (await getJson(`/api/register?${params}`)) as {
        entries?: RegisterEntry[];
        totalCount?: number;
        totalFees?: number;
        committedCount?: number;
        committedFees?: number;
        draftCount?: number;
        draftFees?: number;
      };
      if (ticket !== registerTicket.current) return;
      setRegisterEntries(payload.entries ?? []);
      setRegisterOffset(offset);
      setRegisterTotals({
        count: payload.totalCount ?? 0,
        fees: payload.totalFees ?? 0,
        committedCount: payload.committedCount ?? 0,
        committedFees: payload.committedFees ?? 0,
        draftCount: payload.draftCount ?? 0,
        draftFees: payload.draftFees ?? 0,
      });
    } catch (error) {
      if (ticket !== registerTicket.current) return;
      setRegisterError(messageFor(error, "Could not load the register."));
    } finally {
      if (ticket === registerTicket.current) setRegisterLoading(false);
    }
  }, [registerLimit]);


  const openDraft = useCallback(async (entry: RegisterEntry | { id: string }) => {
    setDraftError(null);
    try {
      const payload = await getJson(`/api/drafts/${entry.id}`);
      setRecoveredDraft(payload as CaptureDraft);
      setView("register");
    } catch (error) {
      setDraftError(messageFor(error, "Could not open this draft."));
    }
  }, []);

  const reviewNext = useCallback(async () => {
    const visible = registerEntries.find((entry) => entry.status === "draft");
    if (visible) return openDraft(visible);
    try {
      const payload = (await getJson(`/api/register?days=${registerDays}&status=draft&limit=1&offset=0`)) as {
        entries?: RegisterEntry[];
      };
      const next = payload.entries?.[0];
      if (next) return openDraft(next);
      setDraftError("There are no drafts waiting for review.");
    } catch (error) {
      setDraftError(messageFor(error, "Could not find a draft to review."));
    }
  }, [openDraft, registerDays, registerEntries]);

  const loadPatientDirectory = useCallback(async (query: string) => {
    const ticket = ++patientsTicket.current;
    setPatientsQuery(query);
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const search = params.toString();
      const payload = (await getJson(`/api/patients${search ? `?${search}` : ""}`)) as {
        patients?: PatientMatch[];
        totalCount?: number;
      };
      if (ticket !== patientsTicket.current) return;
      setPatients(payload.patients ?? []);
      setPatientsTotal(payload.totalCount ?? 0);
    } catch (error) {
      if (ticket !== patientsTicket.current) return;
      // Not silent, and not a stale list presented as current: the workspace
      // says the search failed and keeps whatever it last had, labelled.
      setPatientsError(messageFor(error, "Could not load the patient list."));
    } finally {
      if (ticket === patientsTicket.current) setPatientsLoading(false);
    }
  }, []);

  // First load for whichever workspace is showing, however it got here.
  //
  // `changeView` fetches on a click, which covers navigation but not arrival:
  // the URL sync writes `?view=…`, so a reload, a restored tab or a shared link
  // starts on that view with `view` already set and no click ever happening.
  // For the register that only meant an empty list; for the directory it meant
  // the header stating "0 patients" and the body stating "No patients yet" —
  // a confident, wrong claim that the clinic has no charts, with no spinner and
  // no error, on a screen the doctor reached by reloading the page they were
  // already on.
  useEffect(() => {
    if (view === "register" && !registerLoaded.current) {
      registerLoaded.current = true;
      void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
    }
    if (view === "patients" && !patientsLoaded.current) {
      patientsLoaded.current = true;
      void loadPatientDirectory(patientsQuery);
    }
  }, [
    loadPatientDirectory,
    loadRegister,
    patientsQuery,
    registerDays,
    registerOffset,
    registerQuery,
    registerStatus,
    view,
  ]);

  /**
   * Stable by design. The directory debounces on this identity, so a fresh
   * arrow function on every render would restart the 300ms timer each time an
   * unrelated piece of dashboard state moved.
   */
  const searchPatients = useCallback(
    (query: string) => {
      void loadPatientDirectory(query);
    },
    [loadPatientDirectory],
  );

  const ask = useCallback(async (text: string, patientId?: string) => {
    const ticket = ++recallTicket.current;
    setView("recall");
    setQuestion(text);
    setRecall(null);
    setRecallLoading(true);
    try {
      const payload = await getJson("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, patientId }),
      });
      if (ticket !== recallTicket.current) return;
      const result = payload as RecallResult;
      setRecall(result);

      // "Pull up Sunita's records" asks for the chart itself, so put it on
      // screen instead of making the doctor read a sentence and then tap the
      // card below to get what they asked for.
      //
      // Only when the server actually resolved the name, and that condition is
      // the point of the feature rather than a detail of it. `/api/recall`
      // resolves a spoken name only when one candidate is near-exact *and*
      // clear of the runner-up; two patients called Sunita Devi leave
      // `resolvedPatient` null and come back as a candidate list. Opening a
      // chart on a guess would put one patient's history in front of a doctor
      // who is treating another, silently and with no tap to remember — which
      // is the same reason a spoken name is never auto-linked to a chart at
      // commit time. Ambiguity falls through to the list; picking from it
      // re-asks with the id and arrives back here resolved.
      if (result.query?.intent === "open_record") {
        const patient = patientFromRecall(result);
        if (patient) setChartPatient(patient);
      }
    } catch (error) {
      if (ticket !== recallTicket.current) return;
      // The panel renders its loading state on `loading || !result`, so leaving
      // `recall` null here left the doctor watching "Looking through your
      // register…" forever with no way out but Dismiss.
      setRecall({
        answer: messageFor(error, "Could not search your register."),
        confidence: "low",
        caveat: null,
        encounters: [],
        candidates: [],
        resolvedPatient: null,
        query: null,
      });
    } finally {
      if (ticket === recallTicket.current) setRecallLoading(false);
    }
  }, []);

  /**
   * The classifier called a consultation a question. This is the way back.
   *
   * Cheap by construction: `/api/encounters/transcribe` wrote the transcript
   * row before any classification happened, so the words the doctor spoke were
   * never at risk — this only runs the extraction that was skipped, against
   * that same transcript, with the classifier told to stay out of it. The
   * extract route reuses whatever draft it already holds for a transcript, so a
   * doctor who presses this twice gets one draft rather than two.
   */
  const recordSpokenAsVisit = useCallback(() => {
    if (!spokenQuestion) return;
    // Retire any lookup still in flight. Without this, a slow `/api/recall`
    // answering after the review sheet has opened would repopulate the panel
    // behind it and — for an `open_record` question — throw a patient's chart
    // on top of the draft the doctor is checking.
    recallTicket.current += 1;
    setRecallLoading(false);
    setSpokenQuestion(null);
    setQuestion(null);
    setRecall(null);
    void capture.recordAsVisit(spokenQuestion);
  }, [capture, spokenQuestion]);

  function changeView(next: AppView) {
    setView(next);
    // An explicit "has this been fetched" flag rather than `registerDays === 1`
    // standing in for it. Using the value as its own sentinel meant a doctor who
    // deliberately chose the Today filter, went to Overview and came back had
    // that choice silently replaced with 30 days — every time, with no way to
    // make it stick.
    if (next === "register" && !registerLoaded.current) {
      registerLoaded.current = true;
      void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
    }
    // Same flag, same reason: coming back to the directory should not throw
    // away the search the doctor left in the box.
    if (next === "patients" && !patientsLoaded.current) {
      patientsLoaded.current = true;
      void loadPatientDirectory(patientsQuery);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onCommitted = useCallback(() => {
    capture.reset();
    setRecoveredDraft(null);
    setDiscardedDraftId(null);
    setView("register");
    router.refresh();
    void loadRange(range);
    void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
    // A commit moves a patient's visit count and last-seen date, so a directory
    // already on screen would be wrong. Only when it has been opened, though:
    // refreshing a workspace nobody has looked at spends a lookup token from
    // the shared hourly bucket for nothing.
    if (patientsLoaded.current) void loadPatientDirectory(patientsQuery);
  }, [
    capture,
    loadPatientDirectory,
    loadRange,
    loadRegister,
    patientsQuery,
    range,
    registerOffset,
    registerDays,
    registerQuery,
    registerStatus,
    router,
  ]);

  const onDiscard = useCallback(async () => {
    const id = recoveredDraft?.encounterId ?? capture.draft?.encounterId;
    if (!id) return;
    try {
      const response = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not discard the draft."));
      setDiscardedDraftId(id);
      setRecoveredDraft(null);
      capture.reset();
      void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
    } catch (error) {
      setDraftError(messageFor(error, "Could not discard the draft."));
    }
  }, [capture, loadRegister, recoveredDraft, registerDays, registerOffset, registerQuery, registerStatus]);

  async function restoreDraft() {
    if (!discardedDraftId) return;
    try {
      const response = await fetch(`/api/drafts/${discardedDraftId}`, { method: "POST" });
      if (!response.ok) throw new Error(await errorMessage(response, "Could not restore the draft."));
      const id = discardedDraftId;
      setDiscardedDraftId(null);
      await openDraft({ id });
      void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
    } catch (error) {
      setDraftError(messageFor(error, "Could not restore the draft."));
    }
  }

  async function signOut() {
    // A failed sign-out used to leave the doctor signed in, on the same screen,
    // with nothing said — indistinguishable from a button that does nothing.
    // Navigating regardless is the safer default: the local session is cleared
    // either way, and `proxy.ts` will bounce an unauthenticated request back to
    // /login on the next navigation.
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } catch (error) {
      console.error("[dashboard] sign out failed", error);
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background">
      <AppNavigation
        active={view}
        doctorName={profile.fullName}
        speciality={profile.speciality}
        role={profile.role}
        onChange={changeView}
      />

      <div className="lg:pl-[17rem]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground lg:hidden">
                <BookOpenCheckIcon className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight lg:text-base">
                  {viewTitles[view]}
                </p>
                <p className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                  <CalendarDaysIcon className="size-3" aria-hidden />
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date())}
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(var(--dock-height,9rem)+7rem)] pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-[calc(var(--dock-height,9rem)+2rem)]">
          {(discardedDraftId || draftError) && (
            <Alert variant={draftError ? "destructive" : "default"} className="mb-4">
              <AlertTitle>{draftError ? "Draft action failed" : "Draft discarded"}</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                {draftError ?? "You can restore it while this message is visible."}
                {discardedDraftId && !draftError && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void restoreDraft()}>
                    Restore
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {view === "overview" && (
                <OverviewView
                  doctorName={shortName(profile.fullName)}
                  analytics={analytics}
                  entries={initialEntries}
                  range={range}
                  loadingRange={loadingRange}
                  rangeError={analyticsError}
                  onRangeChange={(days) => void loadRange(days)}
                  onStartDictation={() => void capture.start()}
                  onOpenRegister={() => changeView("register")}
                  onOpenRecall={() => changeView("recall")}
                  onOpenPatient={setChartPatient}
                />
              )}
              {view === "register" && (
                <RegisterWorkspace
                  entries={registerEntries}
                  totalCount={registerTotals.count}
                  totalFees={registerTotals.fees}
                  committedCount={registerTotals.committedCount}
                  committedFees={registerTotals.committedFees}
                  draftCount={registerTotals.draftCount}
                  draftFees={registerTotals.draftFees}
                  offset={registerOffset}
                  limit={registerLimit}
                  hasMore={registerOffset + registerLimit < registerTotals.count}
                  loading={registerLoading}
                  error={registerError}
                  days={registerDays}
                  status={registerStatus}
                  query={registerQuery}
                  onDaysChange={(days) => {
                    setRegisterDays(days);
                    setRegisterOffset(0);
                    void loadRegister(days, registerStatus, registerQuery, 0);
                  }}
                  onStatusChange={(status) => {
                    setRegisterStatus(status);
                    setRegisterOffset(0);
                    void loadRegister(registerDays, status, registerQuery, 0);
                  }}
                  onQueryChange={(query) => {
                    setRegisterQuery(query);
                    setRegisterOffset(0);
                  }}
                  onSearch={() => void loadRegister(registerDays, registerStatus, registerQuery, 0)}
                  onPageChange={(nextOffset) => void loadRegister(registerDays, registerStatus, registerQuery, nextOffset)}
                  onReviewNext={() => void reviewNext()}
                  onOpenPatient={setChartPatient}
                  onOpenDraft={(entry) => void openDraft(entry)}
                  onOpenVisit={(entry) => setVisitDetailId(entry.id)}
                />
              )}
              {view === "patients" && (
                <PatientDirectory
                  patients={patients}
                  totalCount={patientsTotal}
                  loading={patientsLoading}
                  error={patientsError}
                  query={patientsQuery}
                  onSearch={searchPatients}
                  onOpenPatient={setChartPatient}
                />
              )}
              {view === "recall" && (
                <RecallWorkspace
                  question={question}
                  result={recall}
                  loading={recallLoading}
                  onAsk={(text) => {
                    // Typed, so there is no recording behind it and nothing to
                    // recover to a visit. Clearing this is what takes the
                    // action off the panel for the new question.
                    setSpokenQuestion(null);
                    void ask(text);
                  }}
                  onDismiss={() => {
                    setQuestion(null);
                    setRecall(null);
                    setSpokenQuestion(null);
                  }}
                  onPickPatient={(patientId) => {
                    // `spokenQuestion` deliberately survives a pick. Choosing
                    // between two patients called Sunita Devi says nothing
                    // about whether the utterance was a consultation, so the
                    // way back to a visit has to still be there afterwards.
                    if (question) void ask(question, patientId);
                  }}
                  onOpenPatient={setChartPatient}
                  onRecordAsVisit={spokenQuestion ? recordSpokenAsVisit : undefined}
                />
              )}
              {view === "settings" && (
                <SettingsWorkspace
                  profile={profile}
                  onProfileChange={setProfile}
                  onSignOut={() => void signOut()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <VoiceDock
        phase={capture.phase}
        level={capture.level}
        elapsedMs={capture.elapsedMs}
        remainingMs={capture.remainingMs}
        approachingLimit={capture.approachingLimit}
        spectrumRef={capture.spectrumRef}
        interimText={capture.interimText}
        finalText={capture.finalText}
        error={capture.error}
        onStart={() => void capture.start()}
        onStop={() => void capture.stop()}
        onCancel={capture.cancel}
        onAsk={(text) => {
          // The dock's own box is typed too, so the same rule applies as in the
          // recall workspace above.
          setSpokenQuestion(null);
          void ask(text);
        }}
      />

      {(capture.phase === "review" && capture.draft || recoveredDraft) && (
        <ReviewSheet
          draft={(recoveredDraft ?? capture.draft)!}
          onCommitted={onCommitted}
          onDiscard={() => void onDiscard()}
        />
      )}

      <PatientHistorySheet
        patient={chartPatient}
        open={chartPatient !== null}
        onOpenChange={(open) => {
          if (!open) setChartPatient(null);
        }}
        onPatientUpdated={(updated) => {
          setRegisterEntries((current) =>
            current.map((entry) =>
              entry.patient_id === updated.id
                ? {
                    ...entry,
                    patient_name: updated.full_name,
                    age_years: updated.age_years,
                  }
                : entry,
            ),
          );
          // The directory is very often where the sheet was opened from, and
          // closing it back onto the old spelling of a name the doctor has just
          // corrected reads as the correction not having saved.
          setPatients((current) =>
            current.map((entry) =>
              entry.id === updated.id
                ? {
                    ...entry,
                    full_name: updated.full_name,
                    phone: updated.phone,
                    age_years: updated.age_years,
                  }
                : entry,
            ),
          );
          setChartPatient((current) =>
            current?.id === updated.id
              ? {
                  ...current,
                  full_name: updated.full_name,
                  phone: updated.phone,
                  age_years: updated.age_years,
                }
              : current,
          );
          router.refresh();
        }}
      />

      <VisitDetailSheet
        visitId={visitDetailId}
        open={visitDetailId !== null}
        onOpenChange={(open) => {
          if (!open) setVisitDetailId(null);
        }}
        onAmended={() => {
          // The amendment is intentionally not merged into the register row:
          // register rows remain the signed source snapshot. Re-opened details
          // replay amendments from the append-only history.
          void loadRegister(registerDays, registerStatus, registerQuery, registerOffset);
        }}
      />
    </div>
  );
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const honorific = /^(dr\.?|prof\.?)$/i.test(parts[0]) ? parts.shift() : null;
  const last = parts.at(-1) ?? fullName;
  return honorific ? `${honorific.replace(/\.?$/, ".")} ${last}` : last;
}

/**
 * Fetch JSON, and turn a failure into a thrown Error carrying the server's own
 * message where there is one.
 *
 * The version this replaces called `response.json()` *before* checking `ok`,
 * which meant a non-JSON error body — a proxy's 502 HTML page, or an offline
 * browser — threw a SyntaxError out of a `void`-called async function and
 * surfaced as an unhandled promise rejection rather than as anything the doctor
 * could see.
 */
async function getJson(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : `Request failed (${response.status})`);
  }
  return payload;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function initialUrlState(): {
  view: AppView;
  days: number;
  status: RegisterStatus;
  query: string;
  offset: number;
} {
  if (typeof window === "undefined") {
    return { view: "overview", days: DEFAULT_REGISTER_DAYS, status: "all", query: "", offset: 0 };
  }
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const view: AppView = rawView === "register" || rawView === "patients" || rawView === "recall" || rawView === "settings" ? rawView : "overview";
  const rawStatus = params.get("status");
  const status: RegisterStatus = rawStatus === "committed" || rawStatus === "draft" ? rawStatus : "all";
  const daysValue = Number(params.get("days"));
  const offsetValue = Number(params.get("offset"));
  return {
    view,
    days: [1, 7, 30, 90].includes(daysValue) ? daysValue : DEFAULT_REGISTER_DAYS,
    status,
    query: params.get("q") ?? "",
    offset: Number.isFinite(offsetValue) && offsetValue > 0 ? Math.floor(offsetValue) : 0,
  };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
