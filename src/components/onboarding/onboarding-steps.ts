import { formatCount } from "@/lib/format";

/**
 * What "set up" means for a new doctor, worked out from what the account
 * actually holds.
 *
 * No React and no browser here on purpose: every answer this checklist gives is
 * a function of the doctor's real state, so it has to be readable — and
 * checkable — without mounting anything.
 *
 * There is deliberately no "step completed" flag anywhere in this feature. A
 * flag drifts from the thing it describes, and it drifts into the bad failure:
 * telling a doctor to add a registration number they added last week, or to
 * record a first visit that is already in the register. Every status below is
 * recomputed from the profile and the register on each render.
 */

export type OnboardingStepId = "profile" | "languages" | "first-visit" | "register";

/**
 * `checking` and `unknown` are real answers, not placeholders.
 *
 * The two register steps depend on a request, and neither "still in flight" nor
 * "failed" is the same fact as an empty register. Collapsing either to `todo`
 * would tell a doctor with two hundred visits that they have never recorded
 * one, which is exactly the lie this checklist exists to avoid.
 */
export type OnboardingStepStatus = "done" | "todo" | "checking" | "unknown";

/** Which of the checklist's callbacks a step's button fires. */
export type OnboardingIntent = "open-settings" | "start-dictation" | "open-register";

export interface OnboardingAction {
  label: string;
  intent: OnboardingIntent;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  status: OnboardingStepStatus;
  /** One line about the state as it is right now. Never a promise about later. */
  detail: string;
  /** Null when there is nothing useful to press — see `registerStep`. */
  action: OnboardingAction | null;
}

/** The slice of the doctor's profile the checklist reads. */
export interface OnboardingProfileSignal {
  fullName: string | null;
  registrationNo: string | null;
  dictationLangs: readonly string[];
}

/**
 * What the register could be made to say about this doctor.
 *
 * A union rather than a nullable count, because the three cases produce three
 * different sentences and a `number | null` cannot tell the last two apart.
 */
export type OnboardingVisitReport =
  | { readonly state: "checking" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "counted";
      /** Visits held in the register: drafts awaiting review plus confirmed ones. */
      readonly recorded: number;
      /** Of those, the ones read back and confirmed. */
      readonly committed: number;
    };

export interface OnboardingSignals {
  profile: OnboardingProfileSignal;
  visits: OnboardingVisitReport;
}

/**
 * The window the counts are taken over, and the reason both register steps say
 * "in the last year" rather than claiming a lifetime total. `/api/register`
 * clamps `days` to 365, so this is the widest honest count available.
 */
export const VISIT_LOOKBACK_DAYS = 365;

/**
 * The same three codes `/api/profile` accepts, spelled for a doctor.
 *
 * Duplicated from the settings form's `languageOptions`, which is module-private
 * there. A code that is not in this map is printed as-is: it would mean the
 * profile carries a language this build has not been taught, and showing the
 * raw code is more useful than dropping it.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "pa-IN": "Punjabi",
};

export function deriveOnboardingSteps({ profile, visits }: OnboardingSignals): OnboardingStep[] {
  return [profileStep(profile), languageStep(profile), recordStep(visits), registerStep(visits)];
}

/**
 * `doctors.full_name` is `not null` and the sign-up form requires it, so in
 * practice this step is asking for the registration number. It still checks
 * both: an account provisioned outside the sign-up form falls back to the email
 * local part (migration 0003), and that is a name worth replacing.
 */
function profileStep(profile: OnboardingProfileSignal): OnboardingStep {
  const name = text(profile.fullName);
  const registration = text(profile.registrationNo);
  const settings: OnboardingAction = { label: "Open settings", intent: "open-settings" };

  if (name && registration) {
    return {
      id: "profile",
      title: "Name and registration number",
      status: "done",
      detail: `${name} · ${registration}`,
      action: settings,
    };
  }

  return {
    id: "profile",
    title: "Name and registration number",
    status: "todo",
    detail: name
      ? `Saved as ${name}. Add your state council registration number in Settings.`
      : registration
        ? "Your registration number is saved. Add the name that should appear on your visits."
        : "Neither is on your profile yet, and your name is stamped on every visit you record.",
    action: settings,
  };
}

/**
 * Languages arrive already set: a new account is seeded with Hindi and English
 * (migration 0001), and `/api/profile` refuses to save an empty list. So this
 * step is normally complete on day one and says which languages rather than
 * asking for them — a doctor who dictates in Punjabi needs to find that out
 * here, not halfway through a consultation.
 */
function languageStep(profile: OnboardingProfileSignal): OnboardingStep {
  const names = profile.dictationLangs
    .map((code) => LANGUAGE_NAMES[code] ?? code.trim())
    .filter((name) => name.length > 0);

  return {
    id: "languages",
    title: "Dictation languages",
    status: names.length > 0 ? "done" : "todo",
    detail:
      names.length > 0
        ? `Dictation listens for ${sentenceList(names)}.`
        : "No language is set, so dictation has nothing to listen for.",
    action: { label: "Change languages", intent: "open-settings" },
  };
}

function recordStep(visits: OnboardingVisitReport): OnboardingStep {
  const title = "First visit recorded";
  if (visits.state !== "counted") return unchecked("first-visit", title, visits.state);

  return visits.recorded > 0
    ? {
        id: "first-visit",
        title,
        status: "done",
        detail: `${countOfVisits(visits.recorded)} in your register from the last year.`,
        action: null,
      }
    : {
        id: "first-visit",
        title,
        status: "todo",
        detail: "Tap the mic in the dock and talk through a consultation as you normally would.",
        action: { label: "Start dictating", intent: "start-dictation" },
      };
}

function registerStep(visits: OnboardingVisitReport): OnboardingStep {
  const title = "First visit confirmed";
  if (visits.state !== "counted") return unchecked("register", title, visits.state);

  if (visits.committed > 0) {
    return {
      id: "register",
      title,
      status: "done",
      detail: `${countOfVisits(visits.committed)} confirmed in the last year.`,
      action: { label: "Open the register", intent: "open-register" },
    };
  }

  return {
    id: "register",
    title,
    status: "todo",
    detail:
      visits.recorded > 0
        ? "A visit is waiting for review. Read it back, correct anything the transcript missed, then confirm it."
        : "A recorded visit stays a draft until you confirm it. Nothing enters the register on its own.",
    // Sending the doctor to an empty register before anything has been dictated
    // lands them on a screen with nothing to do on it, so the button only
    // appears once there is a draft waiting to be read back.
    action: visits.recorded > 0 ? { label: "Open the register", intent: "open-register" } : null,
  };
}

function unchecked(
  id: OnboardingStepId,
  title: string,
  state: "checking" | "unavailable",
): OnboardingStep {
  return {
    id,
    title,
    status: state === "checking" ? "checking" : "unknown",
    detail:
      state === "checking"
        ? "Checking your register…"
        : "Couldn’t reach your register, so this one is unanswered. Nothing in it has changed.",
    action: null,
  };
}

/**
 * Confirmed visits past which this stops being a setup panel.
 *
 * Twenty is roughly a clinic day. The rate-limit policy in migration 0004 sizes
 * the transcription budget on "a busy clinic runs 4-6 patients an hour", and a
 * four-hour list at that rate is sixteen to twenty-four confirmed visits;
 * twenty sits in the middle. Below it a doctor may still be trying the app out
 * and the four steps are worth the space they take on the overview. Above it
 * they have taken it through a day of real consultations, and their own
 * register has already answered every question the panel asks.
 *
 * Counted in confirmed visits rather than account age for two reasons. Age is
 * the weaker signal — an account opened in March and never used still needs the
 * checklist, and twenty confirmed visits cannot happen unless dictation, review
 * and commit all work. And the client is never told when the account was
 * created: the profile the dashboard holds carries name, registration number,
 * speciality, role and languages, nothing dated. Drafts are excluded on the
 * same reasoning — an abandoned dictation is not evidence of anything.
 */
export const ESTABLISHED_VISITS = 20;

/**
 * Whether the register itself says this doctor is past setup.
 *
 * `unavailable` is deliberately not established: a failed count is not evidence
 * of a full register, and guessing "established" would hide an outstanding step
 * from the new doctor it was written for.
 */
export function isEstablished(visits: OnboardingVisitReport): boolean {
  return visits.state === "counted" && visits.committed >= ESTABLISHED_VISITS;
}

export interface OnboardingNudge {
  /** The whole of it. One line, replacing the panel. */
  line: string;
  /** Null when the outstanding step has nothing to press — see `registerStep`. */
  action: OnboardingAction | null;
}

/**
 * What is left, for a doctor who no longer needs to be walked through this.
 *
 * Returns null when nothing is outstanding, which is the common case and is
 * meant to render as nothing at all: a doctor with a full register should not
 * be shown a setup panel, and "Setup complete" is still a setup panel.
 *
 * Steps that are `checking` or `unknown` are not outstanding work — they are
 * unanswered questions, and this line has no room to explain the difference.
 * They are left to the panel, which does.
 */
export function summariseOutstanding(steps: readonly OnboardingStep[]): OnboardingNudge | null {
  const todo = steps.filter((step) => step.status === "todo");
  const first = todo[0];
  if (!first) return null;

  return {
    // A step's own detail is already a sentence about what to do, so one
    // outstanding step needs no rewording. Several do not fit in a line, so
    // they are named rather than explained.
    line:
      todo.length === 1
        ? first.detail
        : `Still to do: ${todo.map((step) => step.title).join(", ")}.`,
    action: todo.find((step) => step.action)?.action ?? null,
  };
}

export interface OnboardingProgress {
  total: number;
  done: number;
  todo: number;
  checking: number;
  unknown: number;
  /** Every step was answerable and every answer was yes. */
  complete: boolean;
  /** At least one step could not be answered, and not because it is still loading. */
  degraded: boolean;
  /** The counter beside the heading. */
  label: string;
  /** The same fact as a sentence, for the live region. */
  spoken: string;
}

export function summariseOnboarding(steps: readonly OnboardingStep[]): OnboardingProgress {
  const count = (status: OnboardingStepStatus) =>
    steps.filter((step) => step.status === status).length;

  const total = steps.length;
  const done = count("done");
  const checking = count("checking");
  const unknown = count("unknown");
  const complete = total > 0 && done === total;

  // "2 of 4 done" on its own reads as a claim about the other two. Whenever a
  // step could not be answered, how many went unanswered is part of the
  // sentence rather than a detail buried in the list.
  const label = checking
    ? `${done} of ${total} done · checking`
    : unknown
      ? `${done} of ${total} done · ${unknown} not checked`
      : `${done} of ${total} done`;

  return {
    total,
    done,
    todo: total - done - checking - unknown,
    checking,
    unknown,
    complete,
    degraded: unknown > 0,
    label,
    spoken: checking
      ? `Setup: ${done} of ${total} done, still checking your register.`
      : unknown
        ? `Setup: ${done} of ${total} done, ${unknown} could not be checked.`
        : complete
          ? "Setup complete."
          : `Setup: ${done} of ${total} done.`,
  };
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function countOfVisits(count: number): string {
  return count === 1 ? "1 visit" : `${formatCount(count)} visits`;
}

/**
 * "English", "English and Hindi", "English, Hindi and Punjabi".
 *
 * Written out rather than taken from `Intl.ListFormat` so the string is the same
 * on every runtime this ships to — the list names three languages at most, and
 * a locale database is a lot of variance to accept for that.
 */
function sentenceList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
