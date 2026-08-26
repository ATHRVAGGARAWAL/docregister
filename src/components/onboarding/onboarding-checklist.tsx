"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  BookOpenCheckIcon,
  CheckIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  HistoryIcon,
  Loader2Icon,
  Mic2Icon,
  Settings2Icon,
  TriangleAlertIcon,
} from "@/components/icons";
import { useOnboardingDismissal } from "@/components/onboarding/onboarding-dismissal";
import {
  deriveOnboardingSteps,
  summariseOnboarding,
  type OnboardingAction,
  type OnboardingIntent,
  type OnboardingProfileSignal,
  type OnboardingStep,
  type OnboardingStepStatus,
} from "@/components/onboarding/onboarding-steps";
import { useOnboardingVisits } from "@/components/onboarding/use-onboarding-visits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OnboardingChecklistProps {
  /** The doctor's profile, as the dashboard already holds it. */
  profile: OnboardingProfileSignal;
  /** Take the doctor to the settings workspace. */
  onOpenSettings: () => void;
  /**
   * Start a recording — the same call the dock's mic makes. This is a shortcut
   * to that control, never a substitute for it.
   */
  onStartDictation: () => void;
  /** Take the doctor to the register workspace. */
  onOpenRegister: () => void;
  /**
   * Change it whenever a visit is saved or confirmed. Without it the checklist
   * keeps asking for a first visit that has already been recorded until the
   * next full load.
   */
  refreshKey?: number | string;
  /** Match the surrounding document outline. The overview's own title is the h1. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * A doctor's first session, given somewhere to start.
 *
 * Four things have to be true before this app is doing its job, and a new
 * account arrives with none of them visible: the register is empty, the charts
 * are empty, and the only affordance on screen is a microphone. This says what
 * to do, in order, and marks off what is already true.
 *
 * What is already true is the load-bearing part. Every status here is derived —
 * from the profile the dashboard holds and from the register's own counts — so
 * the checklist cannot tell a doctor to do something they did last week. The
 * only thing it remembers is whether they put it away.
 *
 * It renders inline, in normal document flow, with nothing fixed, sticky or
 * overlaid: the voice dock stays reachable at every size, and "Start dictating"
 * below is a shortcut to that same dock control rather than a replacement for
 * it. One tap on Skip puts the whole thing away for good.
 */
export function OnboardingChecklist({
  profile,
  onOpenSettings,
  onStartDictation,
  onOpenRegister,
  refreshKey,
  headingLevel = 2,
  className,
}: OnboardingChecklistProps) {
  const { dismissed, dismiss, restore } = useOnboardingDismissal();
  const { report, busy, reload } = useOnboardingVisits(refreshKey);
  const [undoOffered, setUndoOffered] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);

  const headingId = useId();
  const summaryId = useId();

  const steps = useMemo(
    () => deriveOnboardingSteps({ profile, visits: report }),
    [profile, report],
  );
  const progress = useMemo(() => summariseOnboarding(steps), [steps]);

  // The first unfinished thing, so exactly one button on the panel is the one
  // to press next. Everything else stays quiet.
  const nextStepId = steps.find((step) => step.status === "todo" && step.action)?.id ?? null;

  // Another tab can restore the checklist. Dropping the offer as soon as that
  // lands keeps this tab from flashing an undo strip — and pulling focus into a
  // background document — if it is dismissed again from over there. Adjusted
  // during render rather than in an effect, so the stale strip never paints.
  const [lastSeen, setLastSeen] = useState(dismissed);
  if (lastSeen !== dismissed) {
    setLastSeen(dismissed);
    if (dismissed === false) setUndoOffered(false);
  }

  const showUndo = dismissed === true && undoOffered;

  // Focus follows the control the doctor just used: Skip removes itself, and
  // without this the tab order collapses to the top of the document.
  useEffect(() => {
    if (showUndo) undoRef.current?.focus();
  }, [showUndo]);

  // A map rather than a chain of ifs: adding an intent to the union then fails
  // to compile here instead of quietly falling through to the register.
  const handlers: Record<OnboardingIntent, () => void> = {
    "open-settings": onOpenSettings,
    "start-dictation": onStartDictation,
    "open-register": onOpenRegister,
  };

  if (showUndo) {
    return (
      <section
        className={cn(
          "surface-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl px-4 py-3",
          className,
        )}
      >
        <p id={summaryId} className="text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Setup checklist hidden.</span> You can
          bring it back from Settings whenever you want it.
        </p>
        {/* Described by the line beside it rather than announced through a live
            region: focus lands here the moment the checklist is dismissed, so a
            screen reader reads the button and its description anyway. */}
        <Button
          ref={undoRef}
          type="button"
          variant="outline"
          size="sm"
          aria-describedby={summaryId}
          onClick={() => {
            setUndoOffered(false);
            restore();
          }}
        >
          Undo
        </Button>
      </section>
    );
  }

  // `null` is "the browser has not been asked yet", which is what the server
  // renders. Guessing "not dismissed" here would flash the checklist back onto
  // the screen of every doctor who has already put it away.
  if (dismissed !== false) return null;

  const Heading = `h${headingLevel}` as "h2" | "h3";

  if (progress.complete) {
    return (
      <section
        aria-labelledby={headingId}
        className={cn(
          "surface-card flex flex-wrap items-start gap-x-3 gap-y-2 rounded-2xl px-4 py-3",
          className,
        )}
      >
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-money" aria-hidden />
        <div className="min-w-0 flex-1">
          <Heading id={headingId} className="text-sm font-semibold tracking-[-0.015em]">
            Setup complete
          </Heading>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Your profile, dictation languages and register are all in order.
          </p>
        </div>
        {/* No undo offered on this one: the panel it dismisses is a
            confirmation, not work in progress. Settings still brings it back. */}
        <Button type="button" variant="outline" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={summaryId}
      aria-busy={busy || undefined}
      className={cn("surface-card rounded-2xl p-4 sm:p-5", className)}
    >
      {/* Mounted with the section rather than swapped in when the counts land:
          a live region inserted at the same moment as its text is announced by
          very few screen readers. */}
      <p className="sr-only" role="status" aria-live="polite">
        {progress.spoken}
      </p>

      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary-soft text-primary"
        >
          <BookOpenCheckIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <Heading id={headingId} className="text-sm font-semibold tracking-[-0.015em]">
            Get set up
          </Heading>
          <p id={summaryId} className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {progress.label}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-1.5 shrink-0"
          onClick={() => {
            setUndoOffered(true);
            dismiss();
          }}
        >
          Skip setup
        </Button>
      </div>

      {/* Decorative: every segment's meaning is spelled out in the list below,
          and repeating it here would have a screen reader count to four twice. */}
      <div aria-hidden className="mt-3.5 flex gap-1">
        {steps.map((step) => (
          <span
            key={step.id}
            className={cn(
              "h-1 flex-1 rounded-full",
              step.status === "done"
                ? "bg-primary"
                : step.status === "todo"
                  ? "bg-border"
                  : "bg-secondary",
            )}
          />
        ))}
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3"
          >
            <StepMarker step={step} position={index + 1} />

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm leading-5 font-medium tracking-[-0.01em]",
                  step.status === "done" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {/* Status is carried by a word as well as by the glyph and its
                    colour, so it survives both a screen reader and a doctor
                    who cannot tell the two fills apart. */}
                <span className="sr-only">{STATUS_WORD[step.status]} </span>
                {step.title}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>

              {step.action ? (
                <StepAction
                  action={step.action}
                  emphasis={step.id === nextStepId}
                  onRun={(intent) => handlers[intent]()}
                />
              ) : null}

              {/* Pressing this puts the step back into `checking`, which
                  swaps this button for the spinner marker — so it has no
                  pending state of its own to render. */}
              {step.status === "unknown" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2.5"
                  onClick={reload}
                >
                  <HistoryIcon aria-hidden />
                  Try again
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const STATUS_WORD: Record<OnboardingStepStatus, string> = {
  done: "Done.",
  todo: "To do.",
  checking: "Checking.",
  unknown: "Not checked.",
};

/**
 * The glyph at the head of a row. Its position number is only shown for work
 * still outstanding — on a finished step the check is the more useful mark, and
 * on an unanswered one a number would imply an order that has not been
 * established.
 */
function StepMarker({ step, position }: { step: OnboardingStep; position: number }) {
  const shell =
    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-semibold";

  if (step.status === "done") {
    return (
      <span aria-hidden className={cn(shell, "border-primary bg-primary text-primary-foreground")}>
        <CheckIcon className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }

  if (step.status === "checking") {
    return (
      <span aria-hidden className={cn(shell, "border-border bg-secondary text-muted-foreground")}>
        <Loader2Icon className="size-3.5 animate-spin" />
      </span>
    );
  }

  if (step.status === "unknown") {
    return (
      <span aria-hidden className={cn(shell, "border-warning/40 bg-warning-soft text-warning")}>
        <TriangleAlertIcon className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(shell, "border-field-border bg-background text-muted-foreground")}
    >
      {position}
    </span>
  );
}

/**
 * Only the next unfinished step gets a filled button. Four of them would make
 * the panel a wall of equally urgent choices, which is the state the doctor is
 * already in when they land on an empty dashboard.
 */
function StepAction({
  action,
  emphasis,
  onRun,
}: {
  action: OnboardingAction;
  emphasis: boolean;
  onRun: (intent: OnboardingIntent) => void;
}) {
  const Icon = INTENT_ICONS[action.intent];

  return (
    <Button
      type="button"
      size="sm"
      variant={emphasis ? "default" : "outline"}
      className="mt-2.5"
      onClick={() => onRun(action.intent)}
    >
      <Icon aria-hidden />
      {action.label}
    </Button>
  );
}

const INTENT_ICONS: Record<OnboardingIntent, typeof Settings2Icon> = {
  "open-settings": Settings2Icon,
  "start-dictation": Mic2Icon,
  "open-register": ClipboardListIcon,
};
