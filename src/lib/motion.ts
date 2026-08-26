import type { TargetAndTransition, Transition, Variants } from "motion/react";

/**
 * The app's motion vocabulary.
 *
 * Nothing here is decorative. A register entry that slides in is telling the
 * doctor a row was added; a control that dips under a thumb is telling them the
 * tap landed. Motion that says neither of those things is time taken away from
 * the patient in the chair, which is why every duration below is small and every
 * one of them has to justify itself.
 *
 * This module holds no React. It is the data — durations, curves, targets — so
 * that a server component can read a duration for an inline style without
 * pulling a client bundle behind it. The hooks that pick between the full and
 * the still system live in `@/components/motion`.
 */

/** A cubic-bezier control-point tuple, the shape `Transition.ease` accepts. */
export type Bezier = readonly [number, number, number, number];

/**
 * Durations in seconds, which is what `motion/react` reads. Use `toMs` at the
 * boundary with CSS, `setTimeout` and the Web Animations API.
 */
export const DURATION = {
  /**
   * What every other duration collapses to under `prefers-reduced-motion`, and
   * the value to reach for whenever a state change carries no information about
   * where the thing came from.
   */
  none: 0,
  /**
   * A press. The finger is still on the glass, so the response has to land
   * inside the same contact to read as caused by it rather than as a second,
   * unrelated event.
   */
  press: 0.09,
  /**
   * Hover, focus and state changes on a control. The same 160ms `.pressable`
   * uses in globals.css, so a control animated in JavaScript and one animated
   * by the stylesheet settle together instead of a beat apart.
   */
  control: 0.16,
  /**
   * Something arriving. This is the ceiling for anything a doctor might be
   * waiting on: past roughly a fifth of a second the interface stops reading as
   * responsive and starts reading as slow, and this app is used standing up
   * between patients.
   */
  enter: 0.2,
  /**
   * Something leaving, deliberately quicker than it arrived. An exit is
   * confirmation of a decision already taken — what the doctor is actually
   * waiting for is whatever is underneath.
   */
  exit: 0.14,
  /**
   * A whole surface: the voice dock, a sheet, a panel. The only duration above
   * the control ceiling, because over that much travel `enter` reads as a cut
   * rather than a movement — and because none of these is a control.
   */
  surface: 0.26,
} as const satisfies Record<string, number>;

export type DurationName = keyof typeof DURATION;

/**
 * Stagger for lists.
 *
 * The delay is capped by index rather than applied to every row: a register page
 * can be a hundred visits, and an uncapped step would leave the last one
 * scheduled seconds out — long enough that a doctor scrolling immediately would
 * scroll past rows that have not started animating yet. Past `maxIndex`
 * everything shares the last delay, so the tail of the list is `step * maxIndex`
 * behind the head no matter how long it is.
 */
export const STAGGER = {
  step: 0.035,
  maxIndex: 6,
} as const;

export const EASING = {
  /**
   * The same curve as `--ease-fluid` in globals.css. Front-loaded: it covers
   * most of the distance early and settles, which is what makes a short duration
   * still read as a movement rather than a jump.
   */
  standard: [0.2, 0.8, 0.2, 1],
  /**
   * The mirror, for anything on its way out. Nothing has to be legible at the
   * end of an exit, so it accelerates away instead of decelerating into a
   * position that will not exist.
   */
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

/** Seconds are `motion/react`'s unit; CSS and timers want milliseconds. */
export function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * How far item `index` is held back in a staggered group, in seconds.
 * Exported for call sites that schedule their own delays; the enter variants
 * below already apply it from the element's `custom` prop.
 */
export function staggerDelay(index: number): number {
  // A negative or non-finite index is a caller bug, not a reason to schedule an
  // animation in the past and have the row appear before the ones above it.
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), STAGGER.maxIndex) * STAGGER.step;
}

export type TransitionName = "press" | "control" | "enter" | "exit" | "surface" | "layout";

const FULL_TRANSITIONS: Record<TransitionName, Transition> = {
  press: { duration: DURATION.press, ease: EASING.standard },
  control: { duration: DURATION.control, ease: EASING.standard },
  enter: { duration: DURATION.enter, ease: EASING.standard },
  exit: { duration: DURATION.exit, ease: EASING.exit },
  surface: { duration: DURATION.surface, ease: EASING.standard },
  // A layout animation moves something already on screen and already being
  // looked at, so it is timed like a control rather than like an arrival: the
  // doctor's eye is on the row, not waiting for it.
  layout: { duration: DURATION.control, ease: EASING.standard },
};

const INSTANT: Transition = { duration: DURATION.none };

const NO_TRANSITIONS: Record<TransitionName, Transition> = {
  press: INSTANT,
  control: INSTANT,
  enter: INSTANT,
  exit: INSTANT,
  surface: INSTANT,
  layout: INSTANT,
};

/**
 * Variants that bring something in and take it out again. All four share the
 * key names `hidden`, `visible` and `exit`, so swapping one for another at a
 * call site is a one-word change.
 */
export type EnterVariantName = "rise" | "fade" | "pop" | "surface";

/** Every variant set in the system, including the ones that are not entrances. */
export type VariantName = EnterVariantName | "collapse" | "press";

/**
 * `visible` is a resolver rather than a target so the stagger lives in the
 * variant instead of in a `transition` prop at the call site. A variant's own
 * transition beats the prop, so a call site that passed both would silently lose
 * its delay — this way there is nothing to pass. The element supplies its index
 * through `custom`.
 */
function enterTarget(target: TargetAndTransition, transition: Transition) {
  return (index?: number): TargetAndTransition => ({
    ...target,
    transition: { ...transition, delay: staggerDelay(index ?? 0) },
  });
}

const FULL_VARIANTS: Record<VariantName, Variants> = {
  /**
   * The default entrance: a short lift from below. 8px is enough to read as a
   * direction and short enough that it never looks like the row is travelling.
   */
  rise: {
    hidden: { opacity: 0, y: 8 },
    visible: enterTarget({ opacity: 1, y: 0 }, FULL_TRANSITIONS.enter),
    exit: { opacity: 0, y: -4, transition: FULL_TRANSITIONS.exit },
  },
  /** For anything that has no meaningful direction to come from — a swap in place. */
  fade: {
    hidden: { opacity: 0 },
    visible: enterTarget({ opacity: 1 }, FULL_TRANSITIONS.enter),
    exit: { opacity: 0, transition: FULL_TRANSITIONS.exit },
  },
  /**
   * For a small thing that appears where it will live — a badge, a count, a
   * chip. It has no room to travel, so it grows into place instead.
   */
  pop: {
    hidden: { opacity: 0, scale: 0.94 },
    visible: enterTarget({ opacity: 1, scale: 1 }, FULL_TRANSITIONS.enter),
    exit: { opacity: 0, scale: 0.94, transition: FULL_TRANSITIONS.exit },
  },
  /**
   * A whole surface arriving from the edge it is docked to. Exits back the way
   * it came, which is the one case where matching the entrance is right: it says
   * the surface was dismissed rather than replaced.
   */
  surface: {
    hidden: { opacity: 0, y: 16 },
    visible: enterTarget({ opacity: 1, y: 0 }, FULL_TRANSITIONS.surface),
    exit: { opacity: 0, y: 16, transition: FULL_TRANSITIONS.exit },
  },
  /**
   * Disclosure. Animating to `height: "auto"` costs a measurement per frame, so
   * this is for a paragraph or a field group, not for a list that could be
   * hundreds of rows — that wants a page, not a reveal.
   */
  collapse: {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: "auto", transition: FULL_TRANSITIONS.control },
    exit: { opacity: 0, height: 0, transition: FULL_TRANSITIONS.exit },
  },
  /**
   * Pointer and keyboard feedback on a control, in the same two steps as
   * `.pressable` in globals.css: a 1px lift to say reachable, a shrink to say
   * caught. Prefer the CSS class on a plain button — this exists for elements
   * that are already `motion` components and would otherwise fight it.
   */
  press: {
    rest: { y: 0, scale: 1, transition: FULL_TRANSITIONS.control },
    hover: { y: -1, scale: 1, transition: FULL_TRANSITIONS.control },
    press: { y: 0, scale: 0.985, transition: FULL_TRANSITIONS.press },
  },
};

/**
 * An entrance with nothing to enter from: the element is simply present, in one
 * frame, at the value it was going to end on. Zeroing the duration is not enough
 * on its own — `initial` still paints once, and a single frame at 8px off and
 * fully transparent is exactly the flicker this preference exists to remove.
 */
const STILL: Variants = {
  hidden: { opacity: 1, transition: INSTANT },
  visible: { opacity: 1, transition: INSTANT },
  exit: { opacity: 1, transition: INSTANT },
};

const REST: TargetAndTransition = { y: 0, scale: 1, transition: INSTANT };

const NO_VARIANTS: Record<VariantName, Variants> = {
  rise: STILL,
  fade: STILL,
  pop: STILL,
  surface: STILL,
  // Unlike the entrances, `hidden` here is a state and not an origin: closed
  // disclosure has to actually be closed. Only the time between the two goes.
  collapse: {
    hidden: { opacity: 0, height: 0, transition: INSTANT },
    visible: { opacity: 1, height: "auto", transition: INSTANT },
    exit: { opacity: 0, height: 0, transition: INSTANT },
  },
  // Matching globals.css, which drops `.pressable`'s transform under this
  // preference rather than merely making it instant: a lift that happens in
  // zero time is still a lift. Colour and shadow carry the state instead.
  press: { rest: REST, hover: REST, press: REST },
};

/**
 * The system resolved for one motion preference. Both forms expose the same
 * keys, so a call site reads `system.variants.rise` and never asks which one it
 * is holding.
 */
export interface MotionSystem {
  /** True when this is the still system. Prefer the tokens over branching on it. */
  readonly reduced: boolean;
  readonly duration: Readonly<Record<DurationName, number>>;
  readonly transition: Readonly<Record<TransitionName, Transition>>;
  readonly variants: Readonly<Record<VariantName, Variants>>;
  /**
   * Value for a `layout` prop. Layout animation is projection, not a transition,
   * so a zero duration does not switch it off — this does.
   */
  readonly layout: boolean;
}

const NO_DURATIONS: Record<DurationName, number> = {
  none: 0,
  press: 0,
  control: 0,
  enter: 0,
  exit: 0,
  surface: 0,
};

/** The system as designed, for a device that has not asked for less movement. */
export const FULL_MOTION: MotionSystem = Object.freeze({
  reduced: false,
  duration: DURATION,
  transition: FULL_TRANSITIONS,
  variants: FULL_VARIANTS,
  layout: true,
});

/**
 * The same system with the time taken out. Exported so a test or a story can ask
 * for it directly instead of emulating the media query.
 */
export const NO_MOTION: MotionSystem = Object.freeze({
  reduced: true,
  duration: NO_DURATIONS,
  transition: NO_TRANSITIONS,
  variants: NO_VARIANTS,
  layout: false,
});

/**
 * Pick a system. Two frozen singletons rather than a builder, so this can be
 * called in every render of every animated component without allocating.
 *
 * `null` and `undefined` mean not yet known — `useReducedMotion` returns `null`
 * before it has a document — and resolve to the full system, which is the same
 * thing the server renders.
 */
export function motionSystem(reduceMotion: boolean | null | undefined): MotionSystem {
  return reduceMotion === true ? NO_MOTION : FULL_MOTION;
}
