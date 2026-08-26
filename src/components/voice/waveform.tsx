"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/** Bars in the animated canvas. */
const BARS = 48;
/** Segments in the reduced-motion meter. */
const STEPS = 16;
/**
 * How often the meter re-reads the analyser. Four times a second is fast enough
 * to track a sentence starting and stopping and slow enough that the cost of
 * going through React is irrelevant.
 */
const STEP_INTERVAL_MS = 250;
/**
 * Full scale for the meter. A mean across the speech band does not approach 255
 * even when someone is speaking straight into the phone, so the top of the
 * meter is a realistic loud rather than the theoretical one — against 255,
 * normal dictation lights three segments and the meter reads as a microphone
 * that is barely picking anything up.
 */
const STEP_GAIN = 1.6;

/**
 * Live input waveform.
 *
 * It is the only honest "we are hearing you" signal available. A static pulsing
 * dot animates whether or not the microphone is actually delivering samples —
 * this moves only when there is real audio, which is exactly the feedback a
 * doctor needs before they start talking about a patient.
 *
 * That is why the reduced-motion path is a second implementation rather than a
 * switch that turns the first one off. A canvas that is drawn once and then
 * never again is not a calmer waveform, it is a picture of a microphone that
 * has stopped working, shown to the one user who has no other way to tell.
 *
 * It stays `aria-hidden` in both forms: the transcript underneath it is the
 * accessible equivalent of the audio, and the dock's own polite live region
 * already announces that recording is running.
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
  const reduceMotion = usePrefersReducedMotion();

  return reduceMotion ? (
    // Keyed on `active` so the meter is a fresh component per recording. The
    // alternative is an effect that writes the level back to zero when the
    // microphone stops, and until that effect runs the meter is showing the
    // last quarter-second of the previous patient's audio.
    <LevelMeter
      key={active ? "listening" : "idle"}
      spectrumRef={spectrumRef}
      active={active}
      color={color}
    />
  ) : (
    <WaveformCanvas spectrumRef={spectrumRef} active={active} color={color} />
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Subscribed to rather than sampled once.
 *
 * The old shape read the query inside the draw effect, which captured whichever
 * value happened to be true when the dock opened; a doctor who turned the
 * system preference on mid-session kept the animated canvas until a reload. The
 * server snapshot is `false` because a server has no such preference — that is
 * a claim about what can be rendered, not a guess, and React swaps in the real
 * value as soon as it is on a machine that has one.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Speech energy lives in the lower half of the spectrum; sampling the whole
 * range would leave most of the display permanently flat.
 */
const SPEECH_BAND = 0.55;

/**
 * Drawn on a canvas from a ref, never from React state. The analyser produces a
 * new frame 60 times a second; routing that through `setState` would re-render
 * the dashboard 60 times a second and make the very audio pipeline it is
 * visualising drop frames.
 */
function WaveformCanvas({
  spectrumRef,
  active,
  color,
}: {
  spectrumRef: React.RefObject<Uint8Array>;
  active: boolean;
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

    // The box is measured where it changes — in `resize` — and read from these
    // for the rest of the time. `getBoundingClientRect` inside the loop was a
    // forced layout flush per frame, and a layout flush is the one thing a
    // canvas animation is supposed to have escaped.
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);

      // Collapsed box — the dock is mid-transition or hidden. There is nothing
      // meaningful to paint and the bar geometry would go negative.
      if (width <= 0 || height <= 0) return;

      context.clearRect(0, 0, width, height);

      const spectrum = spectrumRef.current;
      if (decayRef.current.length !== BARS) decayRef.current = new Array(BARS).fill(0);

      const barWidth = Math.max(2, Math.min(3.5, width / (BARS * 2.05)));
      const gap = Math.max(1.5, (width - BARS * barWidth) / (BARS - 1));

      // A barely-there centre line keeps the display legible in a silent room
      // without pretending that audio is arriving.
      context.globalAlpha = active ? 0.12 : 0.08;
      context.fillStyle = ink;
      context.fillRect(0, height / 2 - 0.5, width, 1);

      // Add every capsule to one path and fill once. Besides looking smoother,
      // this lets the canvas draw a restrained audio glow without paying for a
      // shadow operation on every individual bar.
      context.beginPath();

      for (let i = 0; i < BARS; i++) {
        let target = 0;
        if (active && spectrum && spectrum.length > 0) {
          const index = Math.floor((i / BARS) ** 1.35 * (spectrum.length * SPEECH_BAND));
          target = (spectrum[index] ?? 0) / 255;
        }

        const previous = decayRef.current[i];
        decayRef.current[i] = target > previous ? target : previous * 0.86;

        const value = decayRef.current[i];
        const barHeight = Math.max(2, value * height * 0.86);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      }

      context.fillStyle = ink;
      context.globalAlpha = active ? 0.9 : 0.28;
      context.shadowColor = ink;
      context.shadowBlur = active ? 8 : 0;
      context.fill();
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    };

    draw();

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [active, color, spectrumRef]);

  return <canvas ref={canvasRef} className="h-12 w-full text-primary" aria-hidden />;
}

/**
 * The same signal, read in steps instead of drawn in motion.
 *
 * Nothing here translates, scales or eases; the only thing that changes is how
 * many segments are lit, four times a second. That is a readout, not an
 * animation, and it is the part of the waveform that was actually load-bearing
 * — a doctor needs to know the microphone is live, not to watch it dance.
 *
 * Going through React is affordable at that rate, and `setState` with an
 * unchanged step does not re-render, so a silent room costs nothing at all.
 */
function LevelMeter({
  spectrumRef,
  active,
  color,
}: {
  spectrumRef: React.RefObject<Uint8Array>;
  active: boolean;
  color?: string;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Nothing is arriving, so nothing is measured: the zero this component
    // mounts with is already the truth.
    if (!active) return;

    const sample = () => {
      const spectrum = spectrumRef.current;
      if (!spectrum || spectrum.length === 0) {
        setStep(0);
        return;
      }

      const band = Math.max(1, Math.floor(spectrum.length * SPEECH_BAND));
      let sum = 0;
      for (let i = 0; i < band; i++) sum += spectrum[i] ?? 0;

      const level = sum / band / 255;
      setStep(Math.min(STEPS, Math.round(level * STEPS * STEP_GAIN)));
    };

    // The first reading is taken on the first tick rather than here in the
    // effect body: a quarter of a second of an honestly empty meter is better
    // than a synchronous state write during commit, and the analyser has
    // usually not produced a buffer that early anyway.
    const timer = window.setInterval(sample, STEP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, spectrumRef]);

  return (
    <div
      aria-hidden
      style={color ? { color } : undefined}
      className="flex h-12 w-full items-center gap-1 text-primary"
    >
      {Array.from({ length: STEPS }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2 flex-1 rounded-full bg-current shadow-[0_0_8px_currentColor]",
            index < step ? "opacity-100" : "opacity-20",
          )}
        />
      ))}
    </div>
  );
}
