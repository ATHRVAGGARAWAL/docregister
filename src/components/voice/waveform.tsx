"use client";

import { useEffect, useRef } from "react";

/**
 * Live input waveform.
 *
 * Drawn on a canvas from a ref, never from React state. The analyser produces a
 * new frame 60 times a second; routing that through `setState` would re-render
 * the dashboard 60 times a second and make the very audio pipeline it is
 * visualising drop frames.
 *
 * It is also the only honest "we are hearing you" signal available. A static
 * pulsing dot animates whether or not the microphone is actually delivering
 * samples — this moves only when there is real audio, which is exactly the
 * feedback a doctor needs before they start talking about a patient.
 */
export function Waveform({
  spectrumRef,
  active,
  color,
}: {
  spectrumRef: React.RefObject<Uint8Array>;
  active: boolean;
  /**
   * Defaults to the canvas's own inherited `color`, so the bars are set with a
   * Tailwind text utility and follow the theme. A hardcoded hex here was a
   * literal that survived a whole palette change unnoticed — the one colour in
   * the app that could not be re-themed.
   */
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  // Bars decay toward zero rather than snapping, so speech gaps read as a fall
  // rather than a flicker.
  const decayRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Resolved once and cached rather than read per frame: `getComputedStyle`
    // forces a style recalc, and doing that 60 times a second inside the
    // animation loop is the exact cost this component exists to avoid.
    let ink = color ?? getComputedStyle(canvas).color;
    const themeObserver = new MutationObserver(() => {
      if (!color) ink = getComputedStyle(canvas).color;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const BARS = 36;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      context.clearRect(0, 0, width, height);

      const spectrum = spectrumRef.current;
      if (decayRef.current.length !== BARS) decayRef.current = new Array(BARS).fill(0);

      const barWidth = 3;
      const gap = (width - BARS * barWidth) / (BARS - 1);

      for (let i = 0; i < BARS; i++) {
        let target = 0;
        if (active && spectrum && spectrum.length > 0) {
          // Speech energy lives in the lower half of the spectrum; sampling the
          // whole range would leave most bars permanently flat.
          const index = Math.floor((i / BARS) ** 1.35 * (spectrum.length * 0.55));
          target = (spectrum[index] ?? 0) / 255;
        }

        const previous = decayRef.current[i];
        decayRef.current[i] = target > previous ? target : previous * 0.86;

        const value = decayRef.current[i];
        const barHeight = Math.max(2, value * height * 0.9);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        context.fillStyle = ink;
        context.globalAlpha = 0.25 + value * 0.75;
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        context.fill();
      }

      context.globalAlpha = 1;
      if (!reduceMotion) frameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [active, color, spectrumRef]);

  return (
    <canvas
      ref={canvasRef}
      className="text-primary h-10 w-full"
      // The transcript beside it is the accessible equivalent, so the canvas
      // itself is decoration.
      aria-hidden
    />
  );
}
