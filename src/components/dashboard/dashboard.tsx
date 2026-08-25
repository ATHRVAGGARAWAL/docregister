"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheckIcon, CalendarDaysIcon } from "lucide-react";

import { AppNavigation, type AppView } from "@/components/dashboard/app-navigation";
import { OverviewView } from "@/components/dashboard/overview-view";
import { RecallWorkspace } from "@/components/dashboard/recall-workspace";
import { type RecallResult } from "@/components/dashboard/recall-panel";
import { RegisterWorkspace } from "@/components/dashboard/register-workspace";
import {
  SettingsWorkspace,
  type DoctorProfile,
} from "@/components/dashboard/settings-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { PatientHistorySheet } from "@/components/patients/patient-history-sheet";
import { ReviewSheet } from "@/components/voice/review-sheet";
import { VoiceDock } from "@/components/voice/voice-dock";
import { type PatientMatch, useVoiceCapture } from "@/hooks/use-voice-capture";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AnalyticsPayload, RegisterEntry } from "@/lib/types";

const viewTitles: Record<AppView, string> = {
  overview: "Overview",
  register: "Patient register",
  recall: "Patient recall",
  settings: "Account & settings",
};

type RegisterStatus = "all" | "committed" | "draft";

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
  const [view, setView] = useState<AppView>("overview");
  const [profile, setProfile] = useState(initialProfile);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [range, setRange] = useState(30);
  const [loadingRange, setLoadingRange] = useState(false);
  const [accessToken, setAccessToken] = useState<string | undefined>();

  const [question, setQuestion] = useState<string | null>(null);
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [recallLoading, setRecallLoading] = useState(false);

  const [registerEntries, setRegisterEntries] = useState(initialEntries);
  const [registerDays, setRegisterDays] = useState(1);
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>("all");
  const [registerQuery, setRegisterQuery] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [chartPatient, setChartPatient] = useState<PatientMatch | null>(null);

  const capture = useVoiceCapture({
    accessToken,
    liveProxyUrl,
    languages: profile.dictationLangs,
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

  const loadRegister = useCallback(async (days: number, status: RegisterStatus, query: string) => {
    const ticket = ++registerTicket.current;
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (status !== "all") params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const payload = await getJson(`/api/register?${params}`);
      if (ticket !== registerTicket.current) return;
      setRegisterEntries((payload as { entries?: RegisterEntry[] }).entries ?? []);
    } catch (error) {
      if (ticket !== registerTicket.current) return;
      setRegisterError(messageFor(error, "Could not load the register."));
    } finally {
      if (ticket === registerTicket.current) setRegisterLoading(false);
    }
  }, []);

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
      setRecall(payload as RecallResult);
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
      });
    } finally {
      if (ticket === recallTicket.current) setRecallLoading(false);
    }
  }, []);

  function changeView(next: AppView) {
    setView(next);
    if (next === "register" && registerDays === 1) {
      setRegisterDays(30);
      void loadRegister(30, registerStatus, registerQuery);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onCommitted = useCallback(() => {
    capture.reset();
    setView("register");
    router.refresh();
    void loadRange(range);
    void loadRegister(registerDays, registerStatus, registerQuery);
  }, [capture, loadRange, loadRegister, range, registerDays, registerQuery, registerStatus, router]);

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
                  loading={registerLoading}
                  error={registerError}
                  days={registerDays}
                  status={registerStatus}
                  query={registerQuery}
                  onDaysChange={(days) => {
                    setRegisterDays(days);
                    void loadRegister(days, registerStatus, registerQuery);
                  }}
                  onStatusChange={(status) => {
                    setRegisterStatus(status);
                    void loadRegister(registerDays, status, registerQuery);
                  }}
                  onQueryChange={setRegisterQuery}
                  onSearch={() => void loadRegister(registerDays, registerStatus, registerQuery)}
                  onOpenPatient={setChartPatient}
                />
              )}
              {view === "recall" && (
                <RecallWorkspace
                  question={question}
                  result={recall}
                  loading={recallLoading}
                  onAsk={(text) => void ask(text)}
                  onDismiss={() => {
                    setQuestion(null);
                    setRecall(null);
                  }}
                  onPickPatient={(patientId) => {
                    if (question) void ask(question, patientId);
                  }}
                  onOpenPatient={setChartPatient}
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
        onAsk={(text) => void ask(text)}
      />

      {capture.phase === "review" && capture.draft && (
        <ReviewSheet
          draft={capture.draft}
          onCommitted={onCommitted}
          onDiscard={() => {
            const id = capture.draft?.encounterId;
            if (id) void fetch(`/api/encounters/${id}`, { method: "DELETE" });
            capture.reset();
          }}
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
