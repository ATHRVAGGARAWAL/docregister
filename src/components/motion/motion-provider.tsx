"use client";

import { MotionConfig } from "motion/react";
import type * as React from "react";

import { FULL_MOTION } from "@/lib/motion";

interface MotionProviderProps {
  children?: React.ReactNode;
  /**
   * CSP nonce for the one stylesheet `motion` nonces: the block
   * `<AnimatePresence mode="popLayout">` injects to hold an exiting child at the
   * size and position it had. Production `style-src` is `'self'` plus a
   * per-request nonce, so without this that block is refused and a leaving row
   * keeps its space in the flow while it fades instead of popping out of it.
   * Nothing else here needs it — transforms and layout projection are written to
   * the element's own `style` property, which no stylesheet policy governs.
   */
  nonce?: string;
  /**
   * Set true to make every animation resolve instantly, whatever the device
   * prefers. For a Playwright run or a screenshot, where an in-flight animation
   * is a flake and never a feature.
   */
  skipAnimations?: boolean;
}

/**
 * The one place the tree's motion defaults are set. Mount once, near the root.
 *
 * `reducedMotion="user"` is the floor rather than the mechanism: for a doctor
 * who has asked for less movement it resolves transforms and layout animations
 * instantly, but opacity still animates and it says nothing at all about the
 * initial frame — and a first paint at `opacity: 0`, eight pixels low, is most
 * of what that preference is asking not to see. The system in `@/lib/motion` is
 * what actually collapses — this makes sure a component that has not been moved
 * onto it yet still cannot translate anything.
 *
 * The default transition is the control timing, so a `motion` element that
 * passes no transition of its own lands on a system value instead of on the
 * library's default spring, which is longer than anything in this app.
 */
export function MotionProvider({ children, nonce, skipAnimations }: MotionProviderProps) {
  return (
    <MotionConfig
      reducedMotion="user"
      nonce={nonce}
      skipAnimations={skipAnimations}
      transition={FULL_MOTION.transition.control}
    >
      {children}
    </MotionConfig>
  );
}
