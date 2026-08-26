"use client";

import { use, useState } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  MailCheckIcon,
  Mic2Icon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { BrandLockup } from "@/components/brand/brand-mark";
import { Reveal } from "@/components/reactbits/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(callbackError ? "error" : "idle");
  const [message, setMessage] = useState(callbackMessage);

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
    if (!normalizedEmail || (mode === "signup" && !normalizedName)) return;

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
                  ...(inviteToken ? { invite_token: inviteToken } : {}),
                },
              }
            : {}),
        },
      });

      if (error) {
        setStatus("error");
        setMessage(readable(error));
        return;
      }
    } catch (thrown) {
      setStatus("error");
      setMessage(readable(thrown));
      return;
    }

    setStatus("sent");
  }

  const sending = status === "sending";
  const signingUp = mode === "signup";

  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="ambient-orb -top-40 -left-40 size-[36rem] opacity-60" />
        <span className="ambient-orb -right-48 bottom-[-15rem] size-[42rem] opacity-45 [animation-delay:-5s]" />
        <span className="absolute top-[15%] left-[44%] h-[34rem] w-px rotate-[18deg] bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[94rem] items-center justify-between px-5 py-5 sm:px-8 lg:px-10 lg:py-7">
        <BrandLockup />
        <div className="glass-card flex items-center gap-2 rounded-2xl p-1.5">
          <span className="hidden px-2 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase sm:block">
            Private workspace
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[94rem] items-center gap-10 px-5 pb-10 pt-2 sm:px-8 lg:min-h-[calc(100dvh-100px)] lg:grid-cols-[minmax(0,1.12fr)_minmax(25rem,30rem)] lg:gap-20 lg:px-10 lg:pb-20 lg:pt-0">
        <section className="hidden max-w-[44rem] lg:block">
          <Reveal distance={16} duration={0.5}>
            <Badge className="mb-6">
              <ShieldCheckIcon aria-hidden />
              Built for the pace of private practice
            </Badge>
            <h1 className="max-w-[11ch] text-[clamp(3.6rem,6vw,6.6rem)] font-semibold leading-[0.91] tracking-[-0.072em] text-balance">
              Care moves at the speed of <span className="text-gradient">your voice.</span>
            </h1>
            <p className="mt-7 max-w-[35rem] text-lg leading-8 text-muted-foreground">
              A calm clinical workspace that turns a conversation into a precise,
              reviewable record—before the next patient walks in.
            </p>
          </Reveal>

          <Reveal distance={12} duration={0.5} delay={0.08}>
            <div className="glass-card mt-10 max-w-[38rem] overflow-hidden rounded-[1.7rem] p-2">
              <div className="rounded-[1.35rem] border border-primary/15 bg-background/25 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="voice-aura grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-key">
                      <Mic2Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em]">Listening to consultation</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Hindi + clinical English</p>
                    </div>
                  </div>
                  <span className="tnum rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary">
                    00:18
                  </span>
                </div>
                <div className="mt-6 flex h-12 items-center gap-1" aria-hidden>
                  {[18, 30, 46, 28, 54, 38, 22, 48, 34, 58, 28, 42, 18, 34, 24, 46, 30, 20].map(
                    (height, index) => (
                      <span
                        key={`${height}-${index}`}
                        className="w-1 flex-1 rounded-full bg-gradient-to-t from-primary/25 via-primary to-accent/75"
                        style={{ height: `${height}px`, opacity: 0.48 + (index % 4) * 0.12 }}
                      />
                    ),
                  )}
                </div>
                <p className="mt-5 text-[15px] leading-7 text-foreground/85">
                  “Sunita, 42… fever since three days. Start paracetamol and review on Friday.”
                </p>
              </div>
            </div>
          </Reveal>

          <div className="mt-8 grid max-w-[42rem] grid-cols-3 gap-5">
            {workflow.map((item, index) => (
              <Reveal key={item.title} distance={8} duration={0.4} delay={0.12 + index * 0.05}>
                <div className="border-l border-border/70 pl-4">
                  <div className="flex items-center gap-2">
                    <item.icon className="size-3.5 text-primary" aria-hidden />
                    <span className="tnum text-[10px] font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold tracking-[-0.02em]">{item.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal distance={18} duration={0.5} delay={0.04} className="w-full">
          <div className="mb-7 lg:hidden">
            <Badge className="mb-4">
              <ShieldCheckIcon aria-hidden /> Secure clinical workspace
            </Badge>
            <h1 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em]">
              Your register, ready when you are.
            </h1>
          </div>

          <Card className="mx-auto w-full max-w-[30rem] gap-0 overflow-hidden rounded-[2rem] py-0">
            {status === "sent" ? (
              <div className="px-6 py-9 sm:px-8 sm:py-10">
                <span className="grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_36px_-16px_var(--primary)]">
                  <MailCheckIcon className="size-6" aria-hidden />
                </span>
                <p className="section-kicker mt-8">Link sent securely</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Check your inbox</h2>
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
                <CardHeader className="border-b border-border/60 px-6 py-7 sm:px-8 sm:py-8">
                  <div className="mb-4 flex items-center gap-2 text-xs font-medium text-primary">
                    <LockKeyholeIcon className="size-3.5" aria-hidden />
                    Secure clinic access
                  </div>
                  <CardTitle className="text-[1.75rem] font-semibold leading-tight tracking-[-0.04em]">
                    {signingUp ? "Create your clinical workspace" : "Welcome back, doctor"}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6">
                    {signingUp
                      ? "Set up your private register with one secure email link."
                      : "Continue to today’s register with your clinic email."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-6 py-7 sm:px-8 sm:py-8">
                  <Tabs value={mode} onValueChange={changeMode}>
                    <TabsList className="mb-7 grid h-11 w-full grid-cols-2 rounded-xl">
                      <TabsTrigger value="signin" className="h-9 text-sm">Sign in</TabsTrigger>
                      <TabsTrigger value="signup" className="h-9 text-sm">Create account</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <form onSubmit={submit} aria-busy={sending}>
                    <div className="space-y-5">
                      {signingUp && (
                        <div className="space-y-2.5">
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

                      <div className="space-y-2.5">
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

                    <Button type="submit" size="lg" disabled={sending} className="mt-7 w-full">
                      {sending ? (
                        <><LoaderCircleIcon className="animate-spin" aria-hidden /> Sending secure link</>
                      ) : (
                        <>{signingUp ? "Create account" : "Continue with email"}<ArrowRightIcon aria-hidden /></>
                      )}
                    </Button>

                    <div className="my-6 flex items-center gap-3">
                      <Separator className="flex-1" />
                      <span className="text-[9px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Private by design</span>
                      <Separator className="flex-1" />
                    </div>

                    <p className="text-center text-xs leading-5 text-muted-foreground">
                      {signingUp ? "Already have a clinic workspace?" : "New to docregister?"}{" "}
                      <button
                        type="button"
                        onClick={() => changeMode(signingUp ? "signin" : "signup")}
                        className="inline-flex touch-manipulation items-center rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-2"
                      >
                        {signingUp ? "Sign in" : "Create an account"}
                      </button>
                    </p>
                  </form>
                </CardContent>
              </>
            )}
          </Card>

          <div className="mx-auto mt-5 flex max-w-[28rem] flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckIcon className="size-3 text-primary" aria-hidden /> Passwordless</span>
            <span className="flex items-center gap-1.5"><CheckIcon className="size-3 text-primary" aria-hidden /> Mumbai region</span>
            <span className="flex items-center gap-1.5"><CheckIcon className="size-3 text-primary" aria-hidden /> Mobile ready</span>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
