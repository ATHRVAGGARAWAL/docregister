"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lock, Mic, Search, Square, X } from "lucide-react";

import { ClickSpark } from "@/components/reactbits/click-spark";
import { Waveform } from "@/components/voice/waveform";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import type { CapturePhase } from "@/hooks/use-voice-capture";

/**
 * The floating dock — the app's one persistent control.
 *
 * The dock is a piece of hardware sitting on top of the page: opaque card stock
 * with a full cast shadow, holding one physical key. Not a translucent pane.
 * Blur was the old direction's answer to "how does this float"; a shadow is the
 * cheaper and more literal one, and it does not cost a compositor pass per
 * painted pixel on a mid-range Android phone.
 *
 * The key itself is the only object in the app with a real keycap treatment —
 * an inset light-catch along its top edge, a dark inset bevel along the bottom,
 * and three stops of cast shadow beneath. On press it swaps to `--elev-key-down`
 * and travels 1px: the shadow collapses inward and the bevel inverts, which is
 * what a key doing down actually looks like. Everything else on screen is paper.
 *
 * ## Three ways to start a recording, not one
 *
 * Hold-to-talk with slide-up-to-lock is borrowed from WhatsApp, because it is
 * the gesture Indian doctors already have in their fingers. It is also, on its
 * own, unusable by a large number of people: a sustained press plus a drag is
 * exactly the interaction that tremor, arthritis, a prosthetic, a stylus or a
 * switch device cannot produce, and keyboard activation of a button emits a
 * `click` and nothing else — no `pointerdown`, no `pointerup` — so a
 * pointer-only dock leaves the app's entire purpose behind a gesture a keyboard
 * cannot make. That is a WCAG 2.1.1 failure on the primary function, and
 * "slide up to lock" with no alternative is a 2.5.7 failure on top of it.
 *
 * So all three of these do the same thing:
 *
 *   hold and release   — record while held (the fast path between patients)
 *   tap                — start hands-free, tap again to stop
 *   Enter / Space      — identical to tap, via the button's own click event
 *
 * Hold and tap are told apart by how long the press lasted and whether it
 * moved, which is decided on release. Nothing is guessed at press time: the
 * recorder starts on `pointerdown` either way, because a microphone that waits
 * 300ms to find out what kind of press this is loses the first word.
 */

const LOCK_DISTANCE = 64;
/** Under this, with no travel, a press was a tap and not a hold. */
const TAP_MS = 350;
const TAP_SLOP_PX = 10;

export function VoiceDock({
  phase,
  level,
  elapsedMs,
  remainingMs,
  approachingLimit,
  spectrumRef,
  interimText,
  finalText,
  error,
  onStart,
  onStop,
  onCancel,
  onAsk,
}: {
  phase: CapturePhase;
  level: number;
  elapsedMs: number;
  remainingMs: number;
  approachingLimit: boolean;
  spectrumRef: React.RefObject<Uint8Array>;
  interimText: string;
  finalText: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onAsk: (question: string) => void;
}) {
  const [locked, setLocked] = useState(false);
  const [slide, setSlide] = useState(0);
  const [question, setQuestion] = useState("");
  const originY = useRef(0);
  const pressedAt = useRef(0);
  // Set for the duration of a pointer interaction so the synthetic `click` that
  // follows a mouse or touch press does not run the keyboard path as well.
  const pointerHandled = useRef(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const listening = phase === "listening" || phase === "arming";
  const busy = phase === "transcribing" || phase === "extracting";

  usePublishedHeight(dockRef);

  // Recording state is the one thing on this screen a doctor may not be looking
  // at — the whole point of the gesture is that they are looking at the patient.
  // A single polite live region carries it, separate from the transcript's own,
  // so "recording" is announced as a status change rather than as more text.
  const activity = busy
    ? phase === "transcribing"
      ? "Transcribing."
      : "Reading the details."
    : listening
      ? locked
        ? "Recording, hands-free. Press stop when finished."
        : "Recording."
      : "";

  /* ---- Pointer: hold, or tap ------------------------------------------- */

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (listening || busy) return;
      pointerHandled.current = true;
      // Capture the pointer so the slide keeps tracking even when the finger
      // leaves the 64px key — which it always does, that being the point.
      event.currentTarget.setPointerCapture(event.pointerId);
      originY.current = event.clientY;
      pressedAt.current = performance.now();
      setSlide(0);
      setLocked(false);
      onStart();
    },
    [busy, listening, onStart],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!listening || locked) return;
      const delta = Math.max(0, originY.current - event.clientY);
      setSlide(delta);
      if (delta >= LOCK_DISTANCE) {
        setLocked(true);
        // A short haptic is the confirmation — the doctor is looking at the
        // patient, not at the screen.
        navigator.vibrate?.(12);
      }
    },
    [listening, locked],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const travel = Math.abs(originY.current - event.clientY);
      const heldFor = performance.now() - pressedAt.current;
      setSlide(0);

      if (locked) return; // stays open until the stop button is pressed
      if (!listening) return;

      // A quick, still press is a tap: keep recording and hand the doctor their
      // thumb back. Anything longer or with travel in it was a hold, and a hold
      // ends when it is released.
      if (heldFor < TAP_MS && travel < TAP_SLOP_PX) {
        setLocked(true);
        navigator.vibrate?.(12);
        return;
      }

      onStop();
    },
    [listening, locked, onStop],
  );

  /* ---- Keyboard: Enter / Space ------------------------------------------ */

  const handleClick = useCallback(() => {
    // Mouse and touch already ran the pointer path; this is the trailing click
    // they generate. Only a keyboard (or assistive tech) reaches past here.
    if (pointerHandled.current) {
      pointerHandled.current = false;
      return;
    }
    if (busy) return;

    if (listening) {
      onStop();
      return;
    }

    // Keyboard operation is always hands-free — there is no "hold" a keyboard
    // can express, so the first press starts and the second one stops.
    setLocked(true);
    onStart();
  }, [busy, listening, onStart, onStop]);

  // Escape abandons a recording. Useful to everyone, and for a keyboard user it
  // is the only way out that does not commit audio they did not mean to send.
  useEffect(() => {
    if (!listening) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening, onCancel]);

  function submitQuestion(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    onAsk(question.trim());
    setQuestion("");
  }

  const transcript = [finalText, interimText].filter(Boolean).join(" ");
  const holding = listening && !locked;

  return (
    <div
      ref={dockRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {activity}
      </p>

      <motion.div
        layout
        transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="slip pointer-events-auto w-full max-w-xl p-3"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {/* ---- Listening ------------------------------------------------ */}
          {listening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
              className="px-1"
            >
              <div className="flex items-center gap-3">
                <span className="text-foreground tnum flex items-center gap-1.5 text-sm font-medium">
                  {/* `relative` matters: the pulse ring is an ::after pinned to
                      this element's box. It sits at z-index -1 so the expanding
                      ring passes behind the dot rather than washing over it. */}
                  <span
                    className="key-pulse bg-destructive relative size-2 rounded-full"
                    aria-hidden
                  />
                  {formatDuration(elapsedMs)}
                </span>
                <Waveform spectrumRef={spectrumRef} active={phase === "listening"} />
                {locked && (
                  <span className="bg-secondary text-secondary-foreground flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium">
                    <Lock className="size-3" aria-hidden /> Hands-free
                  </span>
                )}
              </div>

              {/* The transcript is read out of a recess, the way a readout on a
                  physical device is. Interim text sits at reduced opacity and
                  settles to full when the engine finalises it, so "not yet
                  certain" is visible without a second colour. */}
              <p
                aria-live="polite"
                className="well text-foreground mt-2 line-clamp-2 min-h-[2.75rem] px-3 py-2 text-sm"
              >
                {transcript ? (
                  <>
                    <span className="transcript-final">{finalText}</span>{" "}
                    <span className="transcript-interim">{interimText}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Listening…</span>
                )}
              </p>

              {approachingLimit && (
                /* A countdown the doctor has to act on inside ten seconds. It
                   was 11px, which is unreadable at arm's length on a phone held
                   at a bedside — the one place this message is ever shown. */
                <p className="text-money mt-1.5 text-sm font-medium" role="status">
                  {Math.ceil(remainingMs / 1000)}s left — wrap up this patient.
                </p>
              )}
            </motion.div>
          )}

          {/* ---- Working -------------------------------------------------- */}
          {busy && (
            <motion.div
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-2 py-2"
            >
              <span className="bg-primary size-2 animate-pulse rounded-full" aria-hidden />
              <p className="text-muted-foreground text-sm">
                {phase === "transcribing"
                  ? "Transcribing what you said…"
                  : "Pulling out the details…"}
              </p>
            </motion.div>
          )}

          {/* ---- Idle ----------------------------------------------------- */}
          {!listening && !busy && (
            <motion.form
              key="idle"
              onSubmit={submitQuestion}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="well flex items-center gap-2 px-3"
            >
              <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What did I prescribe Sunita last time?"
                aria-label="Ask about a patient's history"
                className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
              />
            </motion.form>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="text-destructive mt-2 px-1 text-sm">
            {error}
          </p>
        )}

        {/* ---- The key ---------------------------------------------------- */}
        <div className="mt-3 flex items-center justify-center gap-3">
          {listening && locked ? (
            <>
              <Button variant="outline" size="icon" onClick={onCancel}>
                <X className="size-4" aria-hidden />
                <span className="sr-only">Discard recording</span>
              </Button>
              <button
                type="button"
                onClick={onStop}
                className="bg-destructive shadow-key active:shadow-key-down pressable grid size-14 place-items-center rounded-full text-white"
              >
                <Square className="size-5 fill-current" aria-hidden />
                <span className="sr-only">Stop recording and review this visit</span>
              </button>
            </>
          ) : (
            <div className="relative flex flex-col items-center">
              {holding && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 - slide / LOCK_DISTANCE }}
                  className="text-muted-foreground absolute -top-9 flex flex-col items-center text-xs"
                >
                  <Lock className="size-3.5" aria-hidden />
                  slide up to lock
                </motion.span>
              )}

              {/* The spark reads as the key's contact point. It fires on
                  pointerdown, so it lands with the thumb rather than with the
                  release — and it still fires when the press becomes a slide,
                  which never produces a click. It checks the reduced-motion
                  query itself, so there is nothing to gate here. */}
              <ClickSpark
                sparkColor="var(--primary)"
                sparkRadius={26}
                sparkCount={10}
                className="rounded-full"
              >
                <button
                  type="button"
                  disabled={busy}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onClick={handleClick}
                  aria-pressed={listening}
                  // Without `touchAction: none`, dragging up scrolls the page
                  // instead of locking. The scale tracks input level, so the key
                  // physically responds to the voice hitting it — but only when
                  // motion is welcome; for someone who asked for less of it, a
                  // control that breathes under their finger is not decoration
                  // they can ignore.
                  style={{
                    touchAction: "none",
                    transform: `translateY(${-Math.min(slide, LOCK_DISTANCE)}px) scale(${
                      reduceMotion ? 1 : 1 + level * 0.1
                    })`,
                  }}
                  className="bg-primary text-primary-foreground shadow-key active:shadow-key-down focus-visible:ring-ring focus-visible:ring-offset-background grid size-16 place-items-center rounded-full transition-[box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
                  aria-label={
                    listening
                      ? "Stop recording and review this visit"
                      : "Record a visit. Tap to start hands-free, or hold to record while pressed."
                  }
                >
                  <Mic className="size-6" aria-hidden />
                </button>
              </ClickSpark>

              {!listening && !busy && (
                /* Both gestures named, because a doctor who cannot hold has no
                   way to discover the tap if the label only mentions holding. */
                <span className="text-muted-foreground mt-2 text-xs">Tap or hold to dictate</span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Publish the dock's real height as `--dock-height` on `<html>`.
 *
 * The dock is `fixed`, so it is out of flow and the page under it has to be
 * padded by hand or the last thing on the page sits behind it forever. That
 * padding used to be a guess — `pb-48` — and the guess was wrong in the state
 * that matters: the dock grows by about 80px while recording, to fit the timer
 * and the live transcript, and swallows whatever it grows over.
 *
 * A ResizeObserver removes the guess. `main` reads the variable, so the two can
 * never drift, including when the dock reflows for a long error message or when
 * the on-screen keyboard changes the safe-area inset.
 */
function usePublishedHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty("--dock-height", `${Math.ceil(entry.contentRect.height)}px`);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      root.style.removeProperty("--dock-height");
    };
  }, [ref]);
}
