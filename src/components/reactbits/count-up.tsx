"use client";

import { useCallback, useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

/**
 * CountUp — ported from React Bits (reactbits.dev), with two changes.
 *
 * 1. `format`. The original formats through `Intl.NumberFormat("en-US")`, which
 *    groups in thousands. Indian digit grouping is 2-2-3 — a doctor reading
 *    locale-specific formatting remains stable throughout the animation, so the
 *    formatter is injected by the caller and the component never assumes one.
 *
 * 2. Server-rendered final value. The original writes into `ref.textContent`
 *    from an effect, so the markup ships an empty `<span>` and the figure is
 *    invisible until hydration. This dashboard is server-rendered precisely so
 *    the first paint carries real numbers, so the span renders its final value
 *    as children and the animation only takes over once it is on screen. With
 *    JavaScript off, or under `prefers-reduced-motion`, the number is simply
 *    correct and still.
 */
export function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 1.2,
  className = "",
  startWhen = true,
  format,
  onStart,
  onEnd,
}: {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  format?: (value: number) => string;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? to : from);

  // React Bits' mapping from a single `duration` knob onto spring constants,
  // kept as-is so the motion matches the library's other components.
  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);
  const springValue = useSpring(motionValue, { damping, stiffness });

  const isInView = useInView(ref, { once: true, margin: "0px" });

  const formatValue = useCallback(
    (value: number) => (format ? format(value) : String(Math.round(value))),
    [format],
  );

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!isInView || !startWhen || reduceMotion) return;

    onStart?.();
    motionValue.set(direction === "down" ? to : from);

    // The subscription is opened and closed inside this same effect rather than
    // being gated by an `animating` state flag. A flag would mean setting state
    // synchronously in an effect purely to make a second effect run — a
    // cascading render to arrange a DOM write that never needed React at all.
    const unsubscribe = springValue.on("change", (latest: number) => {
      if (ref.current) ref.current.textContent = formatValue(latest);
    });

    const startId = setTimeout(() => {
      motionValue.set(direction === "down" ? from : to);
    }, delay * 1000);

    const endId = setTimeout(
      () => {
        unsubscribe();
        onEnd?.();
        // Hand the final value back so the DOM matches what React would render
        // — otherwise a later re-render would clobber the text.
        if (ref.current) ref.current.textContent = formatValue(to);
      },
      delay * 1000 + duration * 1000 + 120,
    );

    return () => {
      unsubscribe();
      clearTimeout(startId);
      clearTimeout(endId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, startWhen, to, from, direction, delay, duration, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {formatValue(to)}
    </span>
  );
}

export default CountUp;
