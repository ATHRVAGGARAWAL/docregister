"use client";

import React, { useCallback, useEffect, useRef } from "react";

/**
 * ClickSpark — ported from React Bits (reactbits.dev), with two changes.
 *
 * 1. It fires on `pointerdown`, not `click`. This wraps a hold-to-talk key, so
 *    the spark has to land at the moment the thumb makes contact; on release it
 *    would be confirming something that already happened. It also still fires
 *    when the press turns into a slide-to-lock, which never produces a click.
 *
 * 2. The animation loop is demand-driven. The original leaves a
 *    `requestAnimationFrame` loop running for the lifetime of the page, clearing
 *    an empty canvas sixty times a second forever. On a doctor's phone, left
 *    open on a clinic desk all morning, that is a wakelock on the compositor
 *    for no pixels. Here the loop starts on a press and stops itself once the
 *    last spark has expired.
 */
export function ClickSpark({
  sparkColor = "currentColor",
  sparkSize = 9,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 380,
  easing = "ease-out",
  extraScale = 1,
  className,
  children,
}: {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  extraScale?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<{ x: number; y: number; angle: number; startTime: number }[]>([]);
  const rafRef = useRef<number | null>(null);

  const easeFunc = useCallback(
    (t: number) => {
      switch (easing) {
        case "linear":
          return t;
        case "ease-in":
          return t * t;
        case "ease-in-out":
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
          return t * (2 - t);
      }
    },
    [easing],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const resize = () => {
      const { width, height } = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /**
   * The frame loop lives inside this callback rather than being one itself, so
   * that its recursive `requestAnimationFrame(draw)` closes over a local
   * function instead of over the memoised identity of its own hook — which is
   * a value that has not been assigned yet at the point the body references it.
   */
  const startLoop = useCallback(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        rafRef.current = null;
        return;
      }

      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // The spark colour is resolved from the wrapper's computed `color`, so a
      // caller sets it with a text utility and it tracks the theme.
      ctx.strokeStyle =
        sparkColor === "currentColor"
          ? getComputedStyle(canvas.parentElement!).color
          : sparkColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = now - spark.startTime;
        if (elapsed >= duration) return false;

        const eased = easeFunc(elapsed / duration);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        const cos = Math.cos(spark.angle);
        const sin = Math.sin(spark.angle);

        ctx.beginPath();
        ctx.moveTo(spark.x + distance * cos, spark.y + distance * sin);
        ctx.lineTo(
          spark.x + (distance + lineLength) * cos,
          spark.y + (distance + lineLength) * sin,
        );
        ctx.stroke();
        return true;
      });

      // Nothing left to draw — let the loop die rather than idle.
      rafRef.current = sparksRef.current.length > 0 ? requestAnimationFrame(draw) : null;
    };

    if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw);
  }, [duration, easeFunc, extraScale, sparkColor, sparkRadius, sparkSize]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();

    for (let i = 0; i < sparkCount; i++) {
      sparksRef.current.push({ x, y, angle: (2 * Math.PI * i) / sparkCount, startTime: now });
    }

    startLoop();
  };

  return (
    <div className={className} onPointerDown={handlePointerDown} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" aria-hidden />
      {children}
    </div>
  );
}

export default ClickSpark;
