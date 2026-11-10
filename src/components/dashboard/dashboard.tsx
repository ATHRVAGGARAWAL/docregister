"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CircleAlertIcon,
  PlusIcon,
  SearchIcon,
  ChevronRightIcon,
} from "@/components/icons";

import { AccountsWorkspace } from "@/components/accounts/accounts-workspace";
import {
  FinanceWorkspace,
  OperationsWorkspace,
  ReportsWorkspace,
  ScheduleWorkspace,
  TreatmentsWorkspace,
} from "@/components/lazy/practice";
import {
  AppNavigation,
  type AppView,
} from "@/components/dashboard/app-navigation";
import { FollowUpWorkspace } from "@/components/follow-ups/follow-up-workspace";
import {
  parseDashboardUrlState,
  type DashboardUrlState,
  type RegisterStatus,
} from "@/lib/url-state";
import { OverviewView } from "@/components/dashboard/overview-view";
import { CommandPalette, useCommandPalette } from "@/components/command";
import { ShortcutProvider } from "@/components/shortcuts";
import { RecallWorkspace } from "@/components/dashboard/recall-workspace";
import {
  patientFromRecall,
  type RecallResult,
} from "@/components/dashboard/recall-panel";
import { RegisterWorkspace } from "@/components/dashboard/register-workspace";
import { VisitDetailSheet } from "@/components/dashboard/visit-detail-sheet";
import {
  SettingsWorkspace,
  type DoctorProfile,
} from "@/components/dashboard/settings-workspace";
import { PatientDirectory } from "@/components/patients/patient-directory";
import { PatientHistorySheet } from "@/components/patients/patient-history-sheet";
import { ReviewSheet } from "@/components/voice/review-sheet";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { OfflineNotice } from "@/components/voice/offline-notice";
import { VoiceDock } from "@/components/voice/voice-dock";
import { ManualVisitFlow } from "@/components/voice/manual-visit-flow";
import {
  type CaptureDraft,
  type CaptureTranscript,
  type PatientMatch,
  useVoiceCapture,
} from "@/hooks/use-voice-capture";
import { useAuth, useClerk } from "@clerk/nextjs";
import type {
  AnalyticsPayload,
  CommitOutcome,
  RegisterEntry,
} from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const viewTitles: Record<AppView, string> = {
  overview: "Today",
  register: "Patient register",
  patients: "Patient directory",
  recall: "Search history",
  "follow-ups": "Follow-ups",
  accounts: "Cashbook",
  schedule: "Schedule",
  treatments: "Treatment plans",
  operations: "Lab and inventory",
  finance: "Billing & payments",
  reports: "Reports",
  settings: "Settings",
};

/** The register opens on a month; the Today chip narrows it. */

export function Dashboard({
  initialProfile,
  initialAnalytics,
  initialEntries,
  initialUrlState,
  liveProxyUrl,
}: {
  initialProfile: DoctorProfile;
  initialAnalytics: AnalyticsPayload;
  initialEntries: RegisterEntry[];
  /** Parsed on the server from `?view=…`, so the first paint is the right tab. */
  initialUrlState: DashboardUrlState;
  liveProxyUrl: string;
}) {
  const router = useRouter();
  const { offline } = useNetworkStatus();
  const [view, setView] = useState<AppView>(initialUrlState.view);
  const [profile, setProfile] = useState(initialProfile);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const { getToken } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const [manualVisitOpen, setManualVisitOpen] = useState(false);
  const [visitPatient, setVisitPatient] = useState<PatientMatch | null>(null);
  const [visitSession, setVisitSession] = useState(0);
  const [followUpContext, setFollowUpContext] = useState<CommitOutcome | null>(
    null,
  );
  const [accountsRefreshKey, setAccountsRefreshKey] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const signingOut = useRef(false);

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
  const [spokenQuestion, setSpokenQuestion] =
    useState<CaptureTranscript | null>(null);

  const [registerEntries, setRegisterEntries] = useState(initialEntries);
  const [registerDays, setRegisterDays] = useState(initialUrlState.days);
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>(
    initialUrlState.status,
  );
  const [registerQuery, setRegisterQuery] = useState(initialUrlState.query);
  const [registerOffset, setRegisterOffset] = useState(initialUrlState.offset);
  const registerLimit = 50;
  // Raised by the settings form while it holds unsaved edits, so `changeView`
  // can ask before throwing them away.
  const palette = useCommandPalette();

  // Bounded here rather than inside the palette: twenty is a "recent visits"
  // list, and the full directory is one keystroke away within the palette
  // itself. Memoised because it is a memo dependency there — a fresh slice each
  // render would rebuild every row on every keystroke.
  const paletteVisits = useMemo(
    () =>
      registerEntries
        .filter((entry) => entry.status !== "discarded")
        .slice(0, 20),
    [registerEntries],
  );

  const settingsDirty = useRef(false);
  // Stable identity on purpose: the settings form reports through this from an
  // effect, and a new function each render would re-run that effect on every
  // keystroke in the dashboard.
  const handleSettingsDirty = useCallback((dirty: boolean) => {
    settingsDirty.current = dirty;
  }, []);

  // Distinct names off the register, newest first, for the recall prompts. Two
  // is enough — this is a nudge, not a directory — and `useMemo` keeps it from
  // rebuilding the list on every keystroke elsewhere in the dashboard.
  const recentPatientNames = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of registerEntries) {
      const name = entry.patient_name?.trim();
      if (name) seen.add(name);
      if (seen.size === 2) break;
    }
    return [...seen];
  }, [registerEntries]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerTotals, setRegisterTotals] = useState({
    count: 0,
    committedCount: initialEntries.filter(
      (entry) => entry.status === "committed",
    ).length,
    draftCount: initialEntries.filter((entry) => entry.status === "draft")
      .length,
    discardedCount: 0,
  });
  const [chartPatient, setChartPatient] = useState<PatientMatch | null>(null);
  const [visitDetailId, setVisitDetailId] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<CaptureDraft | null>(
    null,
  );
  const [discardedDraftId, setDiscardedDraftId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // The directory is a page of the clinic's charts plus the honest size of the
  // result, kept apart so the workspace can say "showing 50 of 214" rather than
  // labelling the page with the total.
  const [patients, setPatients] = useState<PatientMatch[]>([]);
  const [patientsTotal, setPatientsTotal] = useState(0);
  const [patientsQuery, setPatientsQuery] = useState("");
  // 0 is the whole directory, which is what the filter's "All" sends.
  const [patientsDays, setPatientsDays] = useState(0);
  const [patientsLoading, setPatientsLoading] = useState(false);
  // Distinct from `patientsLoading`, which is false before the first request is
  // even issued. Without this the directory announces `aria-busy="false"` over
  // an empty list it has never tried to fill — telling a screen-reader user the
  // list is ready and the clinic has no charts, which is the same confident
  // zero the visible count was fixed for.
  const [patientsHasLoaded, setPatientsHasLoaded] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const capture = useVoiceCapture({
    getAccessToken: getToken,
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
    const showExpired = () => setSessionExpired(true);
    window.addEventListener("docregister:session-expired", showExpired);
    return () => window.removeEventListener("docregister:session-expired", showExpired);
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

  const historyView = useRef(initialUrlState.view);
  const historyUrl = useRef("");
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
    const url = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (historyView.current !== view) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    historyView.current = view;
    historyUrl.current = url;
  }, [registerDays, registerOffset, registerQuery, registerStatus, view]);

  const refreshAnalytics = useCallback(async () => {
    const ticket = ++rangeTicket.current;
    try {
      const payload = await getJson("/api/analytics/daily?days=30");
      if (ticket !== rangeTicket.current) return;
      setAnalytics(payload as AnalyticsPayload);
    } catch (error) {
      if (ticket !== rangeTicket.current) return;
      console.error("[dashboard] could not refresh today's note count", error);
    }
  }, []);

  const loadRegister = useCallback(
    async (days: number, status: RegisterStatus, query: string, offset = 0) => {
      const ticket = ++registerTicket.current;
      setRegisterLoading(true);
      setRegisterError(null);
      try {
        const params = new URLSearchParams({
          days: String(days),
          limit: String(registerLimit),
          offset: String(offset),
        });
        if (status !== "all") params.set("status", status);
        if (query.trim()) params.set("q", query.trim());
        const payload = (await getJson(`/api/register?${params}`)) as {
          entries?: RegisterEntry[];
          totalCount?: number;
          committedCount?: number;
          draftCount?: number;
          discardedCount?: number;
        };
        if (ticket !== registerTicket.current) return;
        setRegisterEntries(payload.entries ?? []);
        setRegisterOffset(offset);
        setRegisterTotals({
          count: payload.totalCount ?? 0,
          committedCount: payload.committedCount ?? 0,
          draftCount: payload.draftCount ?? 0,
          discardedCount: payload.discardedCount ?? 0,
        });
      } catch (error) {
        if (ticket !== registerTicket.current) return;
        setRegisterError(messageFor(error, "Could not load the register."));
      } finally {
        if (ticket === registerTicket.current) setRegisterLoading(false);
      }
    },
    [registerLimit],
  );

  const openDraft = useCallback(
    async (entry: RegisterEntry | { id: string }) => {
      setDraftError(null);
      try {
        const payload = await getJson(`/api/drafts/${entry.id}`);
        setRecoveredDraft(payload as CaptureDraft);
      } catch (error) {
        setDraftError(messageFor(error, "Could not open this draft."));
      }
    },
    [],
  );

  const reviewNext = useCallback(async () => {
    const visible = registerEntries.find((entry) => entry.status === "draft");
    if (visible) return openDraft(visible);
    try {
      const payload = (await getJson(
        `/api/register?days=${registerDays}&status=draft&limit=1&offset=0`,
      )) as {
        entries?: RegisterEntry[];
      };
      const next = payload.entries?.[0];
      if (next) return openDraft(next);
      setDraftError("There are no drafts waiting for review.");
    } catch (error) {
      setDraftError(messageFor(error, "Could not find a draft to review."));
    }
  }, [openDraft, registerDays, registerEntries]);

  const loadPatientDirectory = useCallback(async (query: string, days = 0) => {
    const ticket = ++patientsTicket.current;
    setPatientsQuery(query);
    setPatientsDays(days);
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (days > 0) params.set("days", String(days));
      const search = params.toString();
      const payload = (await getJson(
        `/api/patients${search ? `?${search}` : ""}`,
      )) as {
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
      if (ticket === patientsTicket.current) {
        setPatientsLoading(false);
        setPatientsHasLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    const restoreView = () => {
      const state = parseDashboardUrlState(
        Object.fromEntries(new URLSearchParams(window.location.search)),
      );
      if (
        historyView.current === "settings" &&
        state.view !== "settings" &&
        settingsDirty.current
      ) {
        if (
          !window.confirm(
            "You have unsaved changes to your profile. Leave without saving?",
          )
        ) {
          window.history.pushState(null, "", historyUrl.current);
          return;
        }
        settingsDirty.current = false;
      }
      historyView.current = state.view;
      setView(state.view);
      if (state.view === "register") {
        setRegisterDays(state.days);
        setRegisterStatus(state.status);
        setRegisterQuery(state.query);
        setRegisterOffset(state.offset);
        registerLoaded.current = true;
        void loadRegister(state.days, state.status, state.query, state.offset);
      }
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [loadRegister]);

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
      void loadRegister(
        registerDays,
        registerStatus,
        registerQuery,
        registerOffset,
      );
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
      void loadPatientDirectory(query, patientsDays);
    },
    [loadPatientDirectory, patientsDays],
  );

  /** Changing the window re-runs the same search against the new range. */
  const filterPatientsByDays = useCallback(
    (days: number) => {
      void loadPatientDirectory(patientsQuery, days);
    },
    [loadPatientDirectory, patientsQuery],
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
    // Preserve unsaved profile edits when navigating between workspaces.

    if (view === "settings" && next !== "settings" && settingsDirty.current) {
      const leave = window.confirm(
        "You have unsaved changes to your profile. Leave without saving?",
      );
      if (!leave) return;
      settingsDirty.current = false;
    }

    setView(next);
    // An explicit "has this been fetched" flag rather than `registerDays === 1`
    // standing in for it. Using the value as its own sentinel meant a doctor who
    // deliberately chose the Today filter, went to Overview and came back had
    // that choice silently replaced with 30 days — every time, with no way to
    // make it stick.
    if (next === "register" && !registerLoaded.current) {
      registerLoaded.current = true;
      void loadRegister(
        registerDays,
        registerStatus,
        registerQuery,
        registerOffset,
      );
    }
    // Same flag, same reason: coming back to the directory should not throw
    // away the search the doctor left in the box.
    if (next === "patients" && !patientsLoaded.current) {
      patientsLoaded.current = true;
      void loadPatientDirectory(patientsQuery, patientsDays);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openNewVisit(patient: PatientMatch | null = null) {
    if (capture.phase !== "idle" && capture.phase !== "error") return;
    setChartPatient(null);
    setVisitPatient(patient);
    setVisitSession((value) => value + 1);
    setManualVisitOpen(true);
  }

  function openReviewQueue() {
    setRegisterDays(365);
    setRegisterStatus("draft");
    setRegisterQuery("");
    setRegisterOffset(0);
    registerLoaded.current = true;
    changeView("register");
    void loadRegister(365, "draft", "", 0);
  }

  const onCommitted = useCallback(() => {
    setDiscardedDraftId(null);
    setAccountsRefreshKey((current) => current + 1);
    router.refresh();
    void refreshAnalytics();
    void loadRegister(
      registerDays,
      registerStatus,
      registerQuery,
      registerOffset,
    );
    // A commit moves a patient's visit count and last-seen date, so a directory
    // already on screen would be wrong. Only when it has been opened, though:
    // refreshing a workspace nobody has looked at spends a lookup token from
    // the shared hourly bucket for nothing.
    // The window is carried through, or a commit would silently reset a
    // "Today" filter back to the whole directory under the doctor's cursor.
    if (patientsLoaded.current)
      void loadPatientDirectory(patientsQuery, patientsDays);
  }, [
    loadPatientDirectory,
    refreshAnalytics,
    loadRegister,
    patientsQuery,
    patientsDays,
    registerOffset,
    registerDays,
    registerQuery,
    registerStatus,
    router,
  ]);

  const finishCommittedReview = useCallback(() => {
    capture.reset();
    setRecoveredDraft(null);
  }, [capture]);

  const scheduleCommittedFollowUp = useCallback(
    (outcome: CommitOutcome) => {
      setFollowUpContext(outcome);
      finishCommittedReview();
      setManualVisitOpen(false);
      setView("follow-ups");
    },
    [finishCommittedReview],
  );

  const viewRegisterAfterCommit = useCallback(() => {
    finishCommittedReview();
    setManualVisitOpen(false);
    setView("register");
  }, [finishCommittedReview]);

  const startNextVisit = useCallback(() => {
    finishCommittedReview();
    setVisitPatient(null);
    setVisitSession((value) => value + 1);
    setManualVisitOpen(true);
  }, [finishCommittedReview]);

  const onDiscard = useCallback(async () => {
    const id = recoveredDraft?.encounterId ?? capture.draft?.encounterId;
    if (!id) return;
    try {
      const response = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!response.ok)
        throw new Error(
          await errorMessage(response, "Could not discard the draft."),
        );
      setDiscardedDraftId(id);
      setRecoveredDraft(null);
      capture.reset();
      router.refresh();
      void loadRegister(
        registerDays,
        registerStatus,
        registerQuery,
        registerOffset,
      );
    } catch (error) {
      setDraftError(messageFor(error, "Could not discard the draft."));
    }
  }, [
    capture,
    loadRegister,
    recoveredDraft,
    registerDays,
    registerOffset,
    registerQuery,
    registerStatus,
    router,
  ]);

  const keepDraftForLater = useCallback(() => {
    setRecoveredDraft(null);
    capture.reset();
    setDraftError(null);
    router.refresh();
    setView("register");
    setRegisterStatus("draft");
    setRegisterQuery("");
    setRegisterOffset(0);
    void loadRegister(registerDays, "draft", "", 0);
  }, [capture, loadRegister, registerDays, router]);

  async function restoreDraft(id = discardedDraftId) {
    if (!id) return;
    try {
      const response = await fetch(`/api/drafts/${id}`, { method: "POST" });
      if (!response.ok)
        throw new Error(
          await errorMessage(response, "Could not restore the draft."),
        );
      setDiscardedDraftId(null);
      setRegisterStatus("draft");
      setRegisterQuery("");
      setRegisterOffset(0);
      await openDraft({ id });
      void loadRegister(registerDays, "draft", "", 0);
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
      signingOut.current = true;
      await clerkSignOut({ redirectUrl: "/sign-in" });
    } catch (error) {
      console.error("[dashboard] sign out failed", error);
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    // Wrapped here rather than in the root layout: every shortcut this
    // provider owns acts on dashboard state — the view, the dictation, the
    // search box — so a login page that carried them would be advertising
    // keys that cannot do anything.
    <ShortcutProvider
      onNavigate={changeView}
      onNewDictation={() => void capture.start()}
    >
      <div className="workspace-shell min-h-dvh overflow-x-clip">
        <AppNavigation
          active={view}
          doctorName={profile.fullName}
          speciality={profile.speciality}
          role={profile.role}
          onChange={(next) => {
            setFollowUpContext(null);
            changeView(next);
          }}
          onManualEntry={() => openNewVisit()}
          onSignOut={() => void signOut()}
          onSearch={() => palette.setOpen(true)}
          newVisitDisabled={capture.phase !== "idle" && capture.phase !== "error"}
        />

        <div className="lg:pl-60">
          <header className="workspace-topbar">
            <div className="workspace-breadcrumb">
              <span>Workspace</span>
              <ChevronRightIcon aria-hidden />
              <strong>{viewTitles[view]}</strong>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="workspace-global-search"
                onClick={() => palette.setOpen(true)}
              >
                <SearchIcon aria-hidden />
                <span>Search patients, visits, tools…</span>
                <kbd>⌘ K</kbd>
              </button>
              <Button size="sm" onClick={() => openNewVisit()} disabled={capture.phase !== "idle" && capture.phase !== "error"}>
                <PlusIcon aria-hidden />
                New visit
              </Button>
            </div>
          </header>

          <main
            className={`workspace-main mx-auto w-full max-w-[90rem] px-4 pt-32 sm:px-6 lg:px-8 lg:pt-8 ${capture.phase === "idle" ? "pb-10" : "pb-[calc(var(--dock-height,7rem)+1.5rem)]"}`}
          >
            {offline && capture.phase === "idle" && (
              <div className="mb-4">
                <OfflineNotice
                  offline
                  heldRecording={false}
                  onSend={() => {}}
                  onManualEntry={() => openNewVisit()}
                />
              </div>
            )}
            {(discardedDraftId || draftError) && (
              <Alert
                variant={draftError ? "destructive" : "default"}
                role={draftError ? "alert" : "status"}
                className="mb-4"
              >
                <AlertTitle>
                  {draftError ? "Draft action failed" : "Draft discarded"}
                </AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  {draftError ??
                    "You can restore it while this message is visible."}
                  {discardedDraftId && !draftError && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void restoreDraft()}
                    >
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
                transition={{ duration: 0.12, ease: "easeOut" }}
              >
                {view === "overview" && (
                  <OverviewView
                    doctorName={shortName(profile.fullName)}
                    analytics={analytics}
                    entries={initialEntries}
                    dictationPhase={capture.phase}
                    onStartDictation={() => void capture.start()}
                    onStopDictation={() => void capture.stop()}
                    onManualEntry={() => openNewVisit()}
                    onNavigate={changeView}
                    onOpenDraft={(entry) => void openDraft(entry)}
                    onOpenVisit={(entry) => setVisitDetailId(entry.id)}
                    onOpenPatient={setChartPatient}
                    onReviewAll={openReviewQueue}
                  />
                )}
                {view === "register" && (
                  <RegisterWorkspace
                    entries={registerEntries}
                    totalCount={registerTotals.count}
                    committedCount={registerTotals.committedCount}
                    draftCount={registerTotals.draftCount}
                    discardedCount={registerTotals.discardedCount}
                    offset={registerOffset}
                    limit={registerLimit}
                    hasMore={
                      registerOffset + registerLimit < registerTotals.count
                    }
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
                    onSearch={() =>
                      void loadRegister(
                        registerDays,
                        registerStatus,
                        registerQuery,
                        0,
                      )
                    }
                    onPageChange={(nextOffset) =>
                      void loadRegister(
                        registerDays,
                        registerStatus,
                        registerQuery,
                        nextOffset,
                      )
                    }
                    onReviewNext={() => void reviewNext()}
                    onOpenPatient={setChartPatient}
                    onOpenDraft={(entry) => void openDraft(entry)}
                    onRestoreDraft={(entry) => void restoreDraft(entry.id)}
                    onOpenVisit={(entry) => setVisitDetailId(entry.id)}
                  />
                )}
                {view === "patients" && (
                  <PatientDirectory
                    onNewVisit={() => openNewVisit()}
                    patients={patients}
                    totalCount={patientsTotal}
                    loading={patientsLoading}
                    hasLoaded={patientsHasLoaded}
                    error={patientsError}
                    query={patientsQuery}
                    onSearch={searchPatients}
                    days={patientsDays}
                    onDaysChange={filterPatientsByDays}
                    onOpenPatient={setChartPatient}
                  />
                )}
                {view === "recall" && (
                  <RecallWorkspace
                    question={question}
                    result={recall}
                    loading={recallLoading}
                    recentPatientNames={recentPatientNames}
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
                    onRecordAsVisit={
                      spokenQuestion ? recordSpokenAsVisit : undefined
                    }
                  />
                )}
                {view === "follow-ups" && (
                  <FollowUpWorkspace
                    initialPatientId={followUpContext?.patientId}
                    initialEncounterId={followUpContext?.encounterId}
                    encounterContext={
                      followUpContext
                        ? {
                            encounterId: followUpContext.encounterId,
                            patientId: followUpContext.patientId,
                            visitNumber:
                              followUpContext.visitNumber ?? undefined,
                            isNewPatient:
                              followUpContext.isNewPatient ?? undefined,
                            alreadyCommitted: followUpContext.alreadyCommitted,
                          }
                        : null
                    }
                  />
                )}
                {view === "accounts" && (
                  <AccountsWorkspace refreshKey={accountsRefreshKey} />
                )}
                {view === "schedule" && (
                  <ScheduleWorkspace onOpenPatient={setChartPatient} />
                )}
                {view === "treatments" && <TreatmentsWorkspace />}
                {view === "operations" && <OperationsWorkspace />}
                {view === "finance" && <FinanceWorkspace />}
                {view === "reports" && (
                  <ReportsWorkspace analytics={analytics} />
                )}
                {view === "settings" && (
                  <SettingsWorkspace
                    onDirtyChange={handleSettingsDirty}
                    profile={profile}
                    onProfileChange={setProfile}
                    onSignOut={() => void signOut()}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <CommandPalette
          open={palette.open}
          onOpenChange={palette.setOpen}
          activeWorkspace={view}
          onNavigate={changeView}
          recentVisits={paletteVisits}
          onOpenVisit={(entry) =>
            entry.status === "draft"
              ? void openDraft(entry)
              : setVisitDetailId(entry.id)
          }
          onOpenPatient={setChartPatient}
          onNewVisit={() => openNewVisit()}
          onStartDictation={() => void capture.start()}
          onExportRegister={() => {
            // The palette runs the command and closes. The export control,
            // its progress and any error live on the register, so this takes
            // the doctor there rather than starting a download from behind a
            // dialog that is about to disappear.
            changeView("register");
          }}
        />

        {capture.phase !== "idle" && (
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
            liveTextUnavailable={capture.liveTextUnavailable}
            onStart={() => void capture.start()}
            onStop={() => void capture.stop()}
            onCancel={capture.cancel}
            canRetryTranscription={capture.canRetryTranscription}
            onRetryTranscription={capture.retryTranscription}
            onAsk={(text) => {
              // The dock's own box is typed too, so the same rule applies as in the
              // recall workspace above.
              setSpokenQuestion(null);
              void ask(text);
            }}
            onManualEntry={() => openNewVisit()}
          />
        )}

        {((capture.phase === "review" && capture.draft) || recoveredDraft) && (
          <ReviewSheet
            key={(recoveredDraft ?? capture.draft)!.encounterId}
            draft={(recoveredDraft ?? capture.draft)!}
            actionError={draftError}
            onCommitted={onCommitted}
            onDiscard={() => void onDiscard()}
            onKeepForLater={keepDraftForLater}
            onDismissAfterCommit={finishCommittedReview}
            onScheduleFollowUp={scheduleCommittedFollowUp}
            onViewRegister={viewRegisterAfterCommit}
            onStartNext={startNextVisit}
          />
        )}

        <ManualVisitFlow
          key={visitSession}
          initialPatient={visitPatient}
          onDraftDiscarded={onCommitted}
          open={manualVisitOpen}
          onOpenChange={setManualVisitOpen}
          onCommitted={() => { capture.reset(); onCommitted(); }}
          onKeepForLater={keepDraftForLater}
          onScheduleFollowUp={scheduleCommittedFollowUp}
          onViewRegister={viewRegisterAfterCommit}
          onStartNext={startNextVisit}
        />

        <PatientHistorySheet
          patient={chartPatient}
          open={chartPatient !== null}
          onOpenChange={(open) => {
            if (!open) setChartPatient(null);
          }}
          onStartVisit={openNewVisit}
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
            void loadRegister(
              registerDays,
              registerStatus,
              registerQuery,
              registerOffset,
            );
          }}
        />

        <SessionExpiredDialog
          open={sessionExpired}
          onContinue={() => {
            router.replace("/sign-in");
            router.refresh();
          }}
        />
      </div>
    </ShortcutProvider>
  );
}

function SessionExpiredDialog({
  open,
  onContinue,
}: {
  open: boolean;
  onContinue: () => void;
}) {
  return (
    <Sheet open={open}>
      <SheetContent
        showClose={false}
        className="surface-elevated sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="px-6 pb-3 pt-7 text-center">
          <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-warning/12 text-warning">
            <CircleAlertIcon className="size-5" aria-hidden />
          </span>
          <SheetTitle>Session expired</SheetTitle>
          <SheetDescription className="text-sm">
            Sign in again to continue. Any draft already saved for recovery will
            still be available.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={onContinue}
          >
            Return to sign in
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("docregister:session-expired"));
    }
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(
      typeof error === "string" ? error : `Request failed (${response.status})`,
    );
  }
  return payload;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
