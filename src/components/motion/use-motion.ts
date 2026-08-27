"use client";

import { MotionConfigContext, type Variants } from "motion/react";
import { useContext, useSyncExternalStore } from "react";

import { motionSystem, type MotionSystem } from "@/lib/motion";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the device has asked for less movement, live.
 *
 * Subscribed to rather than sampled once. `useReducedMotion` from `motion/react`
 * reads the preference into a `useState` initialiser and never looks again —
 * there is a TODO to that effect in its source — so a doctor who turns the
 * system setting on mid-session keeps the animations they just asked to stop
 * until something remounts. This is also the form to use outside `motion`
 * entirely: a canvas, a `setTimeout`, an autoplaying video.
 *
 * The server snapshot is `false` because a server has no such preference. That
 * is a statement about what can be rendered rather than a guess, and React swaps
 * in the real value as soon as it is on a machine that has one.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * The device preference as `<MotionConfig>` sees it, so a subtree that forces
 * `reducedMotion="always"` — a print view, a visual regression run — gets a
 * motion system that agrees with the engine underneath it instead of one that
 * quietly keeps handing out durations the engine is throwing away.
 */
export function useMotionPreference(): boolean {
  const prefersReduced = usePrefersReducedMotion();
  const { reducedMotion } = useContext(MotionConfigContext);

  // The device preference wins, and cannot be switched off from inside the app.
  //
  // `MotionConfigContext` defaults `reducedMotion` to `"never"`, so honouring
  // that value returned `false` for every tree with no `MotionConfig` above it.
  // The root layout mounts one, but `src/app/global-error.tsx` replaces that
  // layout wholesale and mounts none — the reduced-motion collapse was off on
  // the one screen a doctor reaches when everything else has already failed. A
  // default is indistinguishable from an explicit opt-out through context alone,
  // which is reason enough not to let either of them overrule the person using
  // the device: someone who set "reduce motion" because animation makes them ill
  // is not asking a component library's opinion.
  //
  // `"always"` is still honoured, because forcing motion off is safe in the
  // direction this cares about and is how a test pins the reduced path.
  if (prefersReduced) return true;
  return reducedMotion === "always";
}

/**
 * The motion system for wherever this component is mounted.
 *
 * This is the whole reduced-motion story for a call site: take the tokens from
 * here and use them unconditionally. There is no `reduceMotion ? … : …` to
 * write, and therefore no call site that forgets to write it — which is how
 * ad-hoc motion always fails, one component at a time.
 *
 *     const { variants, transition, layout } = useMotion();
 *     <motion.li layout={layout} variants={variants.rise} custom={index}
 *                initial="hidden" animate="visible" exit="exit" />
 */
export function useMotion(): MotionSystem {
  return motionSystem(useMotionPreference());
}

/** Spread onto a `motion` element to give it the system's press feedback. */
export interface PressProps {
  readonly variants: Variants;
  readonly initial: "rest";
  readonly animate: "rest";
  readonly whileHover: "rest" | "hover";
  readonly whileFocus: "rest" | "hover";
  readonly whileTap: "rest" | "press";
}

/**
 * Press feedback for an element that is already a `motion` component. A plain
 * button should use the `.pressable` class instead — two systems moving the same
 * element fight, and the stylesheet gets there without any JavaScript.
 *
 * `whileFocus` carries the hover state because a keyboard user has no hover.
 * Motion gates it on `:focus-visible`, so clicking a button does not leave it
 * looking hovered afterwards.
 *
 * Both `initial` and `animate` are the rest state, which means this cannot be
 * combined with an element that animates for some other reason — that element
 * wants variants of its own with `hover` and `press` keys added.
 */
export function usePressProps({ disabled = false }: { disabled?: boolean } = {}): PressProps {
  const { variants } = useMotion();

  return {
    variants: variants.press,
    initial: "rest",
    animate: "rest",
    // A disabled control that still dips under a thumb is telling the doctor the
    // tap did something. Matching `.pressable:not(:disabled)` in globals.css.
    whileHover: disabled ? "rest" : "hover",
    whileFocus: disabled ? "rest" : "hover",
    whileTap: disabled ? "rest" : "press",
  };
}
