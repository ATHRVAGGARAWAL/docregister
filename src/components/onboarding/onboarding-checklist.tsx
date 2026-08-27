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
  isEstablished,
  summariseOnboarding,
  summariseOutstanding,
  type OnboardingAction,
  type OnboardingIntent,
  type OnboardingProfileSignal,
  type OnboardingStep,
  type OnboardingStepStatus,
} from "@/components/onboarding/onboarding-steps";
import { useOnboardingVisits } from "@/components/onboarding/use-onboarding-visits";
import { Button } from "@/components/ui/button";
import type { CapturePhase } from "@/hooks/use-voice-capture";
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
   * The dock's phase, when the mount point can supply it.
   *
   * The dictation shortcut is offered only while a recording could actually
   * begin. `useVoiceCapture`'s `start()` returns immediately unless the phase is
   * `idle` or `error`, so a shortcut rendered without knowing the phase is an
   * emphasised, enabled button that does nothing when a doctor presses it
   * mid-consultation. Without this the step still says where the dock mic is,
   * and the dock is the control that can also stop the recording.
   */
  dictationPhase?: CapturePhase;
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
 * It is also the first thing to get out of the way. A doctor whose register is
 * past `ESTABLISHED_VISITS` has demonstrated all four steps, so the panel
 * collapses to a single line naming whatever is genuinely outstanding, and to
 * nothing at all when that list is empty.
 *
 * It renders inline, in normal document flow, with nothing fixed, sticky or
 * overlaid: the voice dock stays reachable at every size, and the dictation
 * shortcut below is a shortcut to that same dock control rather than a
 * replacement for it. One tap on Skip puts the whole thing away for good.
 */
export function OnboardingChecklist({
  profile,
  onOpenSettings,
  onStartDictation,
  onOpenRegister,
  dictationPhase,
  refreshKey,
  headingLevel = 2,
  className,
}: OnboardingChecklistProps) {
  const { dismissed, dismiss, restore } = useOnboardingDismissal();
  // A checklist that has been put away asks the register nothing: see the
  // hook's `enabled`.
  const { report, busy, reload } = useOnboardingVisits({
    enabled: dismissed === false,
    refreshKey,
  });
  const [undoOffered, setUndoOffered] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const restoredRef = useRef<HTMLElement>(null);

  const headingId = useId();
  const summaryId = useId();

  const steps = useMemo(
    () => deriveOnboardingSteps({ profile, visits: report }),
    [profile, report],
  );
  const progress = useMemo(() => summariseOnboarding(steps), [steps]);

  // Another tab can restore the checklist. Dropping the offer as soon as that
  // lands keeps this tab from flashing an undo strip — and pulling focus into a
  // background document — if it is dismissed again from over there. Adjusted
  // during render rather than in an effect, so the stale strip never paints.
  const [lastSeen, setLastSeen] = useState(dismissed);
  if (lastSeen !== dismissed) {
    setLastSeen(dismissed);
    if (dismissed === false) setUndoOffered(false);
  }

  // Nothing renders until the register has answered once. Two of the four steps
  // are questions about the register, and a panel headed "Get set up" whose
  // rows read "Checking your register…" is an alarm about nothing on the screen
  // a doctor opens between patients. A later re-check keeps the panel up — the
  // row shows its own spinner — because by then the doctor asked for it.
  const [answered, setAnswered] = useState(false);
  if (!answered && report.state !== "checking") setAnswered(true);

  const showUndo = dismissed === true && undoOffered;

  // Focus follows the control the doctor just used: Skip removes itself, and
  // without this the tab order collapses to the top of the document.
  useEffect(() => {
    if (showUndo) undoRef.current?.focus();
  }, [showUndo]);

  // The other half of that: Undo removes the button being pressed, so focus has
  // to land on whatever came back. Deferred until there is something to land
  // on, because a doctor who skipped before the first count arrived gets an
  // empty render in between — hence `report` in the dependencies.
  useEffect(() => {
    if (!restoring || !restoredRef.current) return;
    setRestoring(false);
    restoredRef.current.focus();
  }, [restoring, report]);

  // A map rather than a chain of ifs: adding an intent to the union then fails
  // to compile here instead of quietly falling through to the register.
  const handlers: Record<OnboardingIntent, () => void> = {
    "open-settings": onOpenSettings,
    "start-dictation": onStartDictation,
    "open-register": onOpenRegister,
  };

  // The same guard `start()` applies internally. Mirrored rather than inferred
  // so the button and the call agree about when a recording can begin.
  // Absent means "no opinion", not "no". This prop is optional, and a caller
  // that does not pass it — or has not wired it yet — should still get the
  // button: hiding the one action the checklist exists to lead a doctor toward,
  // because a prop was undefined, is a worse failure than offering it a moment
  // too early. Only a phase that is actively recording withdraws it.
  const canDictate =
    dictationPhase === undefined || dictationPhase === "idle" || dictationPhase === "error";

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
            setRestoring(true);
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
  if (!answered) return null;

  const Heading = `h${headingLevel}` as "h2" | "h3";

  if (isEstablished(report)) {
    const outstanding = summariseOutstanding(steps);
    // A register this size has already answered all four questions, so there is
    // nothing left to walk anyone through. What survives is the one thing still
    // genuinely missing — usually a registration number — said once, quietly.
    // When nothing is missing this renders nothing: "Setup complete" is still a
    // setup panel, and it would sit above the register forever.
    if (!outstanding) return null;

    const action = offerable(outstanding.action, canDictate);
    return (
      <section
        ref={restoredRef}
        tabIndex={-1}
        className={cn(
          "surface-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl px-3.5 py-3",
          className,
        )}
      >
        <p className="min-w-0 text-xs leading-5 text-muted-foreground">{outstanding.line}</p>
        {action ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handlers[action.intent]()}
          >
            {action.label}
          </Button>
        ) : null}
      </section>
    );
  }

  if (progress.complete) {
    return (
      <section
        ref={restoredRef}
        tabIndex={-1}
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
        {/* Offers the undo strip like the panel does, for one reason only:
            dismissing this unmounts the button being pressed, and without a
            successor to move focus to a keyboard user is returned to the top of
            the document. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setUndoOffered(true);
            dismiss();
          }}
        >
          Dismiss
        </Button>
      </section>
    );
  }

  // The first unfinished thing that can actually be pressed, so exactly one
  // button on the panel is the one to press next. Everything else stays quiet.
  const nextStepId =
    steps.find((step) => step.status === "todo" && offerable(step.action, canDictate))?.id ?? null;

  return (
    <section
      ref={restoredRef}
      tabIndex={-1}
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
        {steps.map((step, index) => {
          const action = offerable(step.action, canDictate);

          return (
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

                {action ? (
                  <StepAction
                    action={action}
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
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The action a step can offer right now, which is not always the one it holds.
 *
 * Only dictation is conditional, and only because the dock owns that recording:
 * pressing a second start button while one is running does nothing at all, and
 * a control that does nothing is worse than an absent one on a screen a doctor
 * is using mid-consultation.
 */
function offerable(action: OnboardingAction | null, canDictate: boolean): OnboardingAction | null {
  if (!action) return null;
  return action.intent === "start-dictation" && !canDictate ? null : action;
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
