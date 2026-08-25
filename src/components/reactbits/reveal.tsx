"use client";

import React from "react";
import { motion } from "motion/react";

/**
 * Reveal — React Bits' AnimatedContent / FadeContent, rebuilt on `motion`.
 *
 * The library ships both of those on GSAP + ScrollTrigger. This app already
 * carries `motion` for every other transition, and adding a second animation
 * runtime to a phone-first clinical app to slide a section up 40px is not a
 * trade worth making. The prop names are kept so the two are interchangeable
 * if GSAP ever does arrive.
 */
export function Reveal({
  children,
  distance = 24,
  direction = "vertical",
  reverse = false,
  duration = 0.6,
  delay = 0,
  blur = false,
  scale = 1,
  threshold = 0.15,
  once = true,
  className,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  delay?: number;
  blur?: boolean;
  scale?: number;
  threshold?: number;
  once?: boolean;
}) {
  const axis = direction === "horizontal" ? "x" : "y";
  const offset = reverse ? -distance : distance;

  return (
    <motion.div
      initial={{
        opacity: 0,
        [axis]: offset,
        scale,
        ...(blur ? { filter: "blur(6px)" } : {}),
      }}
      whileInView={{
        opacity: 1,
        [axis]: 0,
        scale: 1,
        ...(blur ? { filter: "blur(0px)" } : {}),
      }}
      viewport={{ once, amount: threshold }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * AnimatedItem — the per-row motion out of React Bits' AnimatedList.
 *
 * The library's `AnimatedList` is a self-contained widget: it takes a
 * `string[]`, renders its own rows, paints gradient scroll fades, and binds a
 * global `keydown` listener that swallows Tab. In an app whose main surface is
 * a form, hijacking Tab is a bug, and the gradients are out under this design's
 * no-gradient rule. What is worth keeping is the row motion — scale-and-fade as
 * each item crosses into view — so that is what is lifted here, applied to
 * whatever element the caller names.
 */
export function AnimatedItem({
  children,
  index = 0,
  delay = 0.04,
  as = "div",
  className,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  index?: number;
  delay?: number;
  as?: "div" | "li";
}) {
  // `motion.li` and `motion.div` carry element-specific event handler types, so
  // TypeScript rejects one props spread across the union even though both take
  // exactly the same animation props. Narrowed once here rather than pushing a
  // generic parameter onto every caller.
  const Comp = (as === "li" ? motion.li : motion.div) as typeof motion.div;

  return (
    <Comp
      initial={{ scale: 0.94, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      // Capped so row 40 does not wait a second and a half to appear.
      transition={{ duration: 0.3, delay: Math.min(index, 8) * delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...props}
    >
      {children}
    </Comp>
  );
}
