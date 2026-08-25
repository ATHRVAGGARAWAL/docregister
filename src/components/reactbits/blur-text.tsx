"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, type Transition } from "motion/react";

/**
 * BlurText — ported from React Bits (reactbits.dev).
 *
 * Words settle out of a blur, staggered. Chosen over the library's SplitText
 * because SplitText requires GSAP's SplitText plugin, which is a paid GSAP
 * Club plugin — not a dependency worth taking on for a heading — and because
 * blur-and-settle is quieter than a character-by-character reveal, which is
 * the right register for a screen a doctor reads forty times a day.
 *
 * Renders as a `<span>` rather than the original's `<p>` so it can be dropped
 * inside a heading without producing invalid markup.
 */
const buildKeyframes = (
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>,
): Record<string, Array<string | number>> => {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))]);
  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])];
  });
  return keyframes;
};

export function BlurText({
  text = "",
  delay = 90,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  stepDuration = 0.3,
  onAnimationComplete,
}: {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  stepDuration?: number;
  onAnimationComplete?: () => void;
}) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(node);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const from = useMemo(
    () => ({ filter: "blur(8px)", opacity: 0, y: direction === "top" ? -18 : 18 }),
    [direction],
  );

  const to = useMemo(
    () => [
      { filter: "blur(4px)", opacity: 0.5, y: direction === "top" ? 4 : -4 },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction],
  );

  const stepCount = to.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from({ length: stepCount }, (_, i) => i / (stepCount - 1));

  return (
    <span ref={ref} className={className} style={{ display: "inline-flex", flexWrap: "wrap" }}>
      {elements.map((segment, index) => {
        const transition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: [0.22, 1, 0.36, 1],
        };

        return (
          <motion.span
            key={index}
            initial={from}
            animate={inView ? buildKeyframes(from, to) : from}
            transition={transition}
            onAnimationComplete={
              index === elements.length - 1 ? onAnimationComplete : undefined
            }
            style={{ display: "inline-block", willChange: "transform, filter, opacity" }}
          >
            {segment === " " ? " " : segment}
            {animateBy === "words" && index < elements.length - 1 && " "}
          </motion.span>
        );
      })}
    </span>
  );
}

export default BlurText;
