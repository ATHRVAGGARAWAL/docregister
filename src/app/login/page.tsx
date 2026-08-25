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

import { Reveal } from "@/components/reactbits/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    title: "Dictate naturally",
    copy: "Speak in Hindi, Punjabi or English between consultations.",
  },
  {
    icon: SparklesIcon,
    title: "Review the details",
    copy: "Confirm the patient, diagnosis, treatment and fee before saving.",
  },
  {
    icon: BookOpenCheckIcon,
    title: "Keep the register current",
    copy: "Your daily patient count and revenue update as you work.",
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
  const callbackMessage = callbackError
    ? (CALLBACK_ERRORS[callbackError] ?? "We could not complete sign-in. Please try again.")
    : "";

  const [mode, setMode] = useState<AuthMode>("signin");
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
          ...(mode === "signup" ? { data: { full_name: normalizedName } } : {}),
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
    <main className="relative min-h-dvh overflow-hidden bg-background">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 hidden w-[47%] border-r border-border bg-primary/[0.055] lg:block dark:bg-primary/[0.035]"
      />
      <div
        aria-hidden
        className="absolute -left-24 top-24 hidden size-72 rounded-full border border-primary/15 lg:block"
      />
      <div
        aria-hidden
        className="absolute left-[34%] top-[58%] hidden size-24 rounded-full bg-primary/8 lg:block"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-flat">
            <BookOpenCheckIcon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">docregister</p>
            <p className="text-[11px] text-muted-foreground">Voice-first clinical register</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-10 pt-4 sm:px-8 lg:min-h-[calc(100dvh-96px)] lg:grid-cols-[minmax(0,1fr)_minmax(25rem,29rem)] lg:gap-20 lg:px-10 lg:pb-20 lg:pt-0">
        <section className="order-2 mx-auto w-full max-w-xl lg:order-1 lg:mx-0 lg:max-w-[35rem]">
          <Reveal distance={12} duration={0.45}>
            <Badge variant="default" className="mb-5">
              <ShieldCheckIcon aria-hidden />
              Built for independent clinics
            </Badge>
            <h1 className="max-w-[12ch] text-4xl font-semibold leading-[1.06] tracking-[-0.04em] text-balance sm:text-5xl lg:text-[3.6rem]">
              Your register, ready before the next patient.
            </h1>
            <p className="mt-5 max-w-[34rem] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Turn a quick voice note into a clean, reviewable clinical entry—and keep
              today&rsquo;s patient and revenue numbers current automatically.
            </p>
          </Reveal>

          <Reveal distance={12} duration={0.45} delay={0.08}>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:mt-10 lg:grid-cols-1">
              {workflow.map((item, index) => (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-xl border border-border/80 bg-card/65 p-3.5 shadow-flat backdrop-blur-sm lg:max-w-[31rem] lg:items-center lg:bg-card/45"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="tnum text-[10px] font-semibold text-muted-foreground">
                        0{index + 1}
                      </span>
                      <p className="text-sm font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal distance={8} duration={0.4} delay={0.14}>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground lg:mt-9">
              <span className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" aria-hidden />
                Passwordless access
              </span>
              <span className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" aria-hidden />
                India data residency
              </span>
              <span className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" aria-hidden />
                Works on phone and desktop
              </span>
            </div>
          </Reveal>
        </section>

        <Reveal
          distance={16}
          duration={0.5}
          delay={0.06}
          className="order-1 w-full lg:order-2"
        >
          <Card className="mx-auto w-full max-w-[29rem] gap-0 overflow-hidden py-0">
            {status === "sent" ? (
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <MailCheckIcon className="size-6" aria-hidden />
                </div>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight">Check your inbox</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  We sent a secure {signingUp ? "account setup" : "sign-in"} link to{" "}
                  <span className="font-medium text-foreground">{email.trim()}</span>.
                </p>

                <Alert variant="success" className="mt-6" role="status">
                  <Clock3Icon className="mt-0.5 size-4" aria-hidden />
                  <AlertTitle>Use the newest email</AlertTitle>
                  <AlertDescription>
                    For your security, the link is single-use. You can open it on this device or
                    your phone.
                  </AlertDescription>
                </Alert>

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="mt-7 w-full"
                  onClick={() => setStatus("idle")}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <CardHeader className="border-b border-border/80 px-6 py-6 sm:px-8 sm:py-7">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary">
                    <LockKeyholeIcon className="size-3.5" aria-hidden />
                    Secure clinic access
                  </div>
                  <CardTitle className="text-2xl font-semibold leading-tight">
                    {signingUp ? "Start your clinic register" : "Welcome back"}
                  </CardTitle>
                  <CardDescription className="mt-1.5 text-sm leading-6">
                    {signingUp
                      ? "Create your workspace with one secure email link."
                      : "Sign in with the email linked to your clinic."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-6 py-6 sm:px-8 sm:py-7">
                  <Tabs value={mode} onValueChange={changeMode}>
                    <TabsList className="mb-6 grid h-10 w-full grid-cols-2">
                      <TabsTrigger value="signin" className="h-8 text-sm">
                        Sign in
                      </TabsTrigger>
                      <TabsTrigger value="signup" className="h-8 text-sm">
                        Create account
                      </TabsTrigger>
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
                            className="h-11 bg-background/50"
                          />
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
                          className="h-11 bg-background/50"
                        />
                        <p id="email-hint" className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                          <MailCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          We&rsquo;ll email you a one-time link. No password to remember.
                        </p>
                      </div>
                    </div>

                    {status === "error" && (
                      <Alert id="auth-error" variant="destructive" role="alert" className="mt-5">
                        <CircleAlertIcon className="mt-0.5 size-4" aria-hidden />
                        <AlertTitle>Couldn&rsquo;t send the link</AlertTitle>
                        <AlertDescription>{message}</AlertDescription>
                      </Alert>
                    )}

                    <Button type="submit" size="lg" disabled={sending} className="mt-6 w-full">
                      {sending ? (
                        <>
                          <LoaderCircleIcon className="animate-spin" aria-hidden />
                          Sending secure link
                        </>
                      ) : (
                        <>
                          {signingUp ? "Create account" : "Continue with email"}
                          <ArrowRightIcon aria-hidden />
                        </>
                      )}
                    </Button>

                    <div className="my-6 flex items-center gap-3">
                      <Separator className="flex-1" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Private by design
                      </span>
                      <Separator className="flex-1" />
                    </div>

                    <p className="text-center text-xs leading-5 text-muted-foreground">
                      {signingUp ? "Already have a clinic workspace?" : "New to docregister?"}{" "}
                      <button
                        type="button"
                        onClick={() => changeMode(signingUp ? "signin" : "signup")}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {signingUp ? "Sign in" : "Create an account"}
                      </button>
                    </p>
                  </form>
                </CardContent>
              </>
            )}
          </Card>

          <p className="mx-auto mt-5 max-w-[26rem] text-center text-[11px] leading-5 text-muted-foreground">
            Patient data is stored in the Mumbai region in line with ABDM&rsquo;s Health Data
            Management Policy.
          </p>
        </Reveal>
      </div>
    </main>
  );
}
