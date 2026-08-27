"use client";

import { use, useEffect, useState } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  LoaderCircleIcon,
  MailCheckIcon,
  Mic2Icon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@/components/icons";

import { BrandLockup, BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";

const CALLBACK_ERRORS: Record<string, string> = {
  expired_link: "That sign-in link has expired or was already used. Request a fresh one below.",
  missing_code: "That sign-in link is incomplete. Request a fresh one below.",
};

type AuthMode = "signin" | "signup";
type Status = "idle" | "sending" | "sent" | "error";

const workflow = [
  {
    icon: Mic2Icon,
    title: "Speak naturally",
    copy: "Hindi, Punjabi or English—the register listens in your clinical rhythm.",
  },
  {
    icon: SparklesIcon,
    title: "Review with clarity",
    copy: "Patient, diagnosis, treatment and medicines arrive ready to confirm.",
  },
  {
    icon: BookOpenCheckIcon,
    title: "Stay effortlessly current",
    copy: "Every verified visit updates the register, history and clinic picture.",
  },
];

function readable(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  const message = error instanceof Error ? error.message.trim() : "";
  return message || NETWORK_ERROR;
}

/**
 * Seconds left on the auth provider's send cooldown, or null.
 *
 * The provider answers a repeat request with its own sentence — "For security
 * purposes, you can only request this after 52 seconds." — and that number is
 * stale the instant it is painted. Showing it as static text asks a doctor to
 * guess when it expired, and the button stays enabled the whole time so every
 * press earns another refusal.
 *
 * Parsed rather than pattern-matched on a code, because Supabase's rate-limit
 * responses have not carried a stable code across versions and the number is
 * the part worth having. A missed match falls through to the plain message,
 * which is what happened before.
 */
function cooldownSeconds(error: unknown): number | null {
  const message = error instanceof Error ? error.message : "";
  const match = /after (\d+) seconds?/i.exec(message);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) : null;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = use(searchParams);
  const callbackError = Array.isArray(query.error) ? query.error[0] : query.error;
  const nextPath = Array.isArray(query.next) ? query.next[0] : (query.next ?? "/");
  const inviteToken = Array.isArray(query.invite) ? query.invite[0] : query.invite;
  const callbackMessage = callbackError
    ? (CALLBACK_ERRORS[callbackError] ?? "We could not complete sign-in. Please try again.")
    : "";

  const [mode, setMode] = useState<AuthMode>(inviteToken ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(callbackError ? "error" : "idle");
  /** Epoch ms when the provider will accept another link request. */
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [message, setMessage] = useState(callbackMessage);

  // One interval, only while a cooldown is live. Reading the deadline rather
  // than decrementing a counter means a backgrounded tab — a doctor switching
  // apps while they wait — comes back with the right number instead of one that
  // stopped counting.
  useEffect(() => {
    if (cooldownUntil === null) return;

    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      // Both cleared together: `cooldownUntil` retires the effect, and
      // `secondsLeft` is what the button reads, so leaving either behind either
      // keeps the interval alive or keeps the button disabled.
      if (left <= 0) {
        setCooldownUntil(null);
        setSecondsLeft(0);
        return;
      }
      setSecondsLeft(left);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [cooldownUntil]);

  function clearError() {
    if (status !== "error") return;
    setStatus("idle");
    setMessage("");
  }

  function changeMode(value: string) {
    setMode(value as AuthMode);
    setStatus("idle");
    setMessage("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedName = fullName.trim();
    const normalizedClinic = clinicName.trim();
    if (!normalizedEmail || (mode === "signup" && (!normalizedName || !normalizedClinic))) return;

    setStatus("sending");
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: mode === "signup",
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          ...(mode === "signup"
            ? {
                data: {
                  full_name: normalizedName,
                  // An invite already names the clinic and proves the claim, so
                  // the typed name would only be a second, weaker answer to a
                  // question that is already settled.
                  ...(inviteToken
                    ? { invite_token: inviteToken }
                    : { clinic_name: normalizedClinic }),
                },
              }
            : {}),
        },
      });

      if (error) {
        setStatus("error");
        const wait = cooldownSeconds(error);
        if (wait !== null) {
          setCooldownUntil(Date.now() + wait * 1000);
          // Deliberately not the provider's sentence. It names a number that is
          // already counting down, and the doctor is looking at the countdown.
          setMessage(
            "A sign-in link was sent to this address a moment ago. Check your inbox and spam — " +
              "a new one can be sent shortly.",
          );
        } else {
          setMessage(readable(error));
        }
        return;
      }
    } catch (thrown) {
      setStatus("error");
      const wait = cooldownSeconds(thrown);
      if (wait !== null) {
        setCooldownUntil(Date.now() + wait * 1000);
        setMessage(
          "A sign-in link was sent to this address a moment ago. Check your inbox and spam — " +
            "a new one can be sent shortly.",
        );
      } else {
        setMessage(readable(thrown));
      }
      return;
    }

    setStatus("sent");
  }

  const sending = status === "sending";
  const signingUp = mode === "signup";

  return (
    <main className="flex min-h-dvh flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 mx-auto flex w-full max-w-[90rem] items-center justify-between border-b border-border bg-background px-5 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-8 sm:py-4 lg:px-10">
        <BrandMark className="sm:hidden" title="docregister" />
        <BrandLockup className="hidden sm:inline-flex" />
        <div className="flex items-center gap-2">
          <span className="hidden px-2 text-xs font-medium text-muted-foreground sm:block">
            Private workspace
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[90rem] flex-1 items-center gap-10 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(25rem,29rem)] lg:gap-20 lg:px-10 lg:py-14">
        <section className="hidden max-w-[44rem] lg:block">
          <Badge variant="outline" className="mb-6">
            <ShieldCheckIcon aria-hidden />
            Built for private practice
          </Badge>
          <h1 className="max-w-[11ch] text-[clamp(3.6rem,6vw,6.4rem)] font-semibold leading-[0.92] tracking-[-0.072em] text-balance">
            Care moves at the speed of <span className="text-primary">your voice.</span>
          </h1>
          <p className="mt-7 max-w-[35rem] text-lg leading-8 text-muted-foreground">
            Turn a consultation into a precise, reviewable record before the next patient walks in.
          </p>

          <div className="surface-card mt-10 max-w-[38rem] overflow-hidden rounded-[1.25rem] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Mic2Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em]">Listening to consultation</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Hindi + clinical English</p>
                    </div>
                  </div>
                  <span className="tnum rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
                    00:18
                  </span>
                </div>
                <div className="mt-6 flex h-12 items-center gap-1" aria-hidden>
                  {[18, 30, 46, 28, 54, 38, 22, 48, 34, 58, 28, 42, 18, 34, 24, 46, 30, 20].map(
                    (height, index) => (
                      <span
                        key={`${height}-${index}`}
                        className="w-1 flex-1 rounded-full bg-primary"
                        style={{ height: `${height}px`, opacity: 0.34 + (index % 4) * 0.14 }}
                      />
                    ),
                  )}
                </div>
                <p className="mt-5 text-[15px] leading-7 text-foreground/85">
                  “Sunita, 42… fever since three days. Start paracetamol and review on Friday.”
                </p>
          </div>

          <div className="mt-8 grid max-w-[42rem] grid-cols-3 gap-5">
            {workflow.map((item, index) => (
              <div key={item.title} className="border-l border-border pl-4">
                  <div className="flex items-center gap-2">
                    <item.icon className="size-3.5 text-primary" aria-hidden />
                    <span className="tnum text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold tracking-[-0.02em]">{item.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full">
          <div className="mx-auto mb-7 max-w-[29rem] lg:hidden">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.11em] text-primary uppercase">
              <ShieldCheckIcon className="size-3.5" aria-hidden /> Secure clinical workspace
            </p>
            <h1 className="mt-3 max-w-[17ch] text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.035em] text-balance sm:text-4xl sm:leading-[1.05]">
              Your register, ready when you are.
            </h1>
          </div>

          <Card className="mx-auto w-full max-w-[29rem] gap-0 overflow-hidden rounded-[1.25rem] py-0 sm:rounded-[1.5rem]">
            {status === "sent" ? (
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <MailCheckIcon className="size-6" aria-hidden />
                </span>
                <p className="section-kicker mt-7">Link sent securely</p>
                <h2 className="mt-2 text-[1.625rem] font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">
                  Check your inbox
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  We sent a secure {signingUp ? "account setup" : "sign-in"} link to{" "}
                  <span className="font-medium text-foreground">{email.trim()}</span>.
                </p>
                <Alert variant="success" className="mt-6" role="status">
                  <Clock3Icon className="mt-0.5 size-4" aria-hidden />
                  <AlertTitle>Use the newest email</AlertTitle>
                  <AlertDescription>The link is single-use and works on this device or your phone.</AlertDescription>
                </Alert>
                <Button type="button" variant="outline" size="lg" className="mt-7 w-full" onClick={() => setStatus("idle")}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <CardHeader className="border-b border-border/60 px-6 pb-5 pt-6 sm:px-8 sm:py-8">
                  <CardTitle className="text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.035em] sm:text-[1.75rem]">
                    {signingUp ? "Create your clinical workspace" : "Welcome back, doctor"}
                  </CardTitle>
                  <CardDescription className="mt-2.5 text-sm leading-5 sm:leading-6">
                    {signingUp
                      ? "Set up your private register with one secure email link."
                      : "Continue to today’s register with your clinic email."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
                  <Tabs value={mode} onValueChange={changeMode}>
                    <TabsList className="mb-6 grid h-12 w-full grid-cols-2 rounded-xl sm:mb-7">
                      <TabsTrigger value="signin" className="h-10 text-sm">Sign in</TabsTrigger>
                      <TabsTrigger value="signup" className="h-10 text-sm">Create account</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <form onSubmit={submit} aria-busy={sending}>
                    <div className="space-y-5">
                      {signingUp && (
                        <div className="space-y-2">
                          <Label htmlFor="full-name">Your name</Label>
                          <Input
                            id="full-name"
                            name="full-name"
                            type="text"
                            required
                            autoComplete="name"
                            value={fullName}
                            onChange={(event) => {
                              setFullName(event.target.value);
                              clearError();
                            }}
                            placeholder="Dr. Aditi Mehta"
                            className="h-12"
                          />
                        </div>
                      )}

                      {signingUp && !inviteToken && (
                        <div className="space-y-2">
                          <Label htmlFor="clinic-name">Clinic name</Label>
                          <Input
                            id="clinic-name"
                            name="clinic-name"
                            type="text"
                            required
                            autoComplete="organization"
                            aria-describedby="clinic-hint"
                            value={clinicName}
                            onChange={(event) => {
                              setClinicName(event.target.value);
                              clearError();
                            }}
                            placeholder="Sunrise Family Clinic"
                            className="h-12"
                          />
                          <p
                            id="clinic-hint"
                            className="text-muted-foreground text-xs leading-5"
                          >
                            Type it exactly as your colleagues do. If someone from your clinic
                            is already here, you will join their register once they approve
                            you — capitalisation and extra spaces do not matter.
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="email">Work email</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          inputMode="email"
                          aria-invalid={status === "error"}
                          aria-describedby={status === "error" ? "auth-error" : "email-hint"}
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            clearError();
                          }}
                          placeholder="doctor@clinic.in"
                          className="h-12"
                        />
                        <p id="email-hint" className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                          <MailCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                          We’ll email a one-time link. No password to remember.
                        </p>
                      </div>
                    </div>

                    {status === "error" && (
                      <Alert id="auth-error" variant="destructive" role="alert" className="mt-5">
                        <CircleAlertIcon className="mt-0.5 size-4" aria-hidden />
                        <AlertTitle>Couldn’t send the link</AlertTitle>
                        <AlertDescription>{message}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      size="lg"
                      disabled={sending || secondsLeft > 0}
                      className="mt-6 h-12 w-full sm:mt-7"
                    >
                      {sending ? (
                        <><LoaderCircleIcon className="animate-spin" aria-hidden /> Sending secure link</>
                      ) : secondsLeft > 0 ? (
                        // The wait is on the button rather than only in the error,
                        // because the button is the thing being pressed. A live
                        // number also says the app is still working, where a
                        // greyed-out control with a stale sentence above it reads
                        // as broken.
                        <>Try again in {secondsLeft}s</>
                      ) : (
                        <>{signingUp ? "Create account" : "Continue with email"}<ArrowRightIcon aria-hidden /></>
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={() => changeMode(signingUp ? "signin" : "signup")}
                      className="mt-4 flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-muted-foreground outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{signingUp ? "Already have a clinic workspace?" : "New to docregister?"}</span>
                      <span className="font-semibold text-primary">
                        {signingUp ? "Sign in" : "Create an account"}
                      </span>
                    </button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>

          <div className="mx-auto mt-6 grid max-w-[28rem] grid-cols-3 gap-2 text-center text-[0.6875rem] font-medium leading-4 text-muted-foreground sm:flex sm:items-center sm:justify-center sm:gap-6 sm:text-xs">
            <span className="flex items-center justify-center gap-1.5"><CheckIcon className="size-3 shrink-0 text-primary" aria-hidden /> Passwordless</span>
            <span className="flex items-center justify-center gap-1.5"><CheckIcon className="size-3 shrink-0 text-primary" aria-hidden /> Mumbai region</span>
            <span className="flex items-center justify-center gap-1.5"><CheckIcon className="size-3 shrink-0 text-primary" aria-hidden /> Mobile ready</span>
          </div>
        </section>
      </div>
    </main>
  );
}
