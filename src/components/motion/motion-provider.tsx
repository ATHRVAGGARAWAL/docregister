"use client";

import { MotionConfig } from "motion/react";
import type * as React from "react";

import { FULL_MOTION } from "@/lib/motion";

interface MotionProviderProps {
  children?: React.ReactNode;
  /**
   * CSP nonce for the style tags motion injects. The proxy mints one per
   * request and the root layout already reads it; without it those styles are
   * dropped and layout animations render without their projection styles.
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
 * `reducedMotion="user"` is the floor rather than the mechanism: it stops the
 * engine animating transforms for a doctor who has asked for less movement, but
 * it leaves opacity and layout alone, and it says nothing at all about the
 * initial frame. The system in `@/lib/motion` is what actually collapses — this
 * makes sure a component that has not been moved onto it yet still cannot
 * translate anything.
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
