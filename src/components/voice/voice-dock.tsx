"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines, FilePenLine, Mic, Search, SendHorizontal, Square, X } from "@/components/icons";

import { OfflineNotice } from "@/components/voice/offline-notice";
import { Waveform } from "@/components/voice/waveform";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { useNetworkStatus } from "@/hooks/use-network-status";
import type { CapturePhase } from "@/hooks/use-voice-capture";
import { cn } from "@/lib/utils";
import { voiceTapAction } from "@/lib/audio/voice-gesture";

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
 * The microphone is deliberately a plain toggle. A click or tap starts a
 * hands-free recording; the next click or tap stops it and opens review. Using
 * the button's normal click event keeps touch, mouse, keyboard and assistive
 * technology on the same predictable path.
 */

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
  liveTextUnavailable,
  onStart,
  onStop,
  onCancel,
  canRetryTranscription,
  onRetryTranscription,
  onAsk,
  onManualEntry,
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
  liveTextUnavailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  canRetryTranscription: boolean;
  onRetryTranscription: () => void;
  onAsk: (question: string) => void;
  onManualEntry: () => void;
}) {
  const [question, setQuestion] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const listening = phase === "listening" || phase === "arming";
  const busy = phase === "transcribing" || phase === "extracting";

  const { offline } = useNetworkStatus();

  /**
   * Whether the recording being held met a dead network on its way out.
   *
   * `offline` cannot answer that alone: by the time the connection is back it
   * reads false again, and a recording stranded by an outage is no longer
   * distinguishable from one the server refused. Remembering it is what lets
   * the dock make the specific offer — the connection you lost is back, send
   * the thing you already said — instead of a generic "try again".
   *
   * Snapshotted as the hold appears rather than in an effect, so the answer is
   * on screen in the same paint as the failure. The second branch covers the
   * order that is not guaranteed on a phone losing signal: the upload can
   * reject a beat before the browser fires `offline`.
   *
   * This lives in memory for the life of the page and deliberately goes no
   * further — what it refers to is consultation audio on a shared clinic
   * phone. The reasoning is in offline-notice.tsx; read it before adding
   * storage of any kind.
   */
  const [hold, setHold] = useState({ held: false, duringOutage: false });
  if (hold.held !== canRetryTranscription) {
    setHold({ held: canRetryTranscription, duringOutage: canRetryTranscription && offline });
  } else if (hold.held && offline && !hold.duringOutage) {
    setHold({ held: true, duringOutage: true });
  }

  // Not while busy: a send already in flight is described by the dock's own
  // working state, and offering to send it there reads as a dock that has not
  // noticed. Not a claim that the upload will now succeed either — only that
  // connectivity is the honest explanation to lead with.
  const offlineHold = canRetryTranscription && !busy && (offline || hold.duringOutage);

  const sendHeldRecording = useCallback(() => {
    // Forget the outage as the doctor acts on it, so that a second failure for
    // a reason that is not the network falls back to the ordinary error, with
    // the server's own message, instead of "the connection is back" sitting on
    // top of it offering the same button again. If the browser still reads
    // offline the branch above re-arms this on the next render, which is
    // right — there the outage is not in the past tense.
    setHold((current) => ({ ...current, duringOutage: false }));
    onRetryTranscription();
  }, [onRetryTranscription]);

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
      ? "Recording. Tap stop when finished."
      : "";

  const handleToggle = useCallback(() => {
    const action = voiceTapAction({ listening, busy });
    if (action === "start") onStart();
    if (action === "stop") onStop();
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
  return (
    <div
      ref={dockRef}
      className="voice-dock-frame pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] lg:left-64"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {activity}
      </p>

      <motion.div
        layout
        transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "surface-dock pointer-events-auto relative isolate w-full max-w-[42rem] overflow-visible rounded-xl p-1.5 sm:p-2",
          !listening && !busy && "voice-dock-idle grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
        )}
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
              className="min-w-0 px-1.5 pt-1.5 sm:px-3 sm:pt-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="surface-inset tnum flex min-h-7 items-center gap-2 rounded-full px-2.5 text-xs font-semibold text-foreground sm:min-h-8 sm:px-3">
                  <span
                    className="key-pulse relative size-2 rounded-full bg-destructive"
                    aria-hidden
                  />
                  {formatDuration(elapsedMs)}
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">Tap stop to finish</span>
              </div>

              <div className="surface-inset relative mt-1.5 overflow-hidden rounded-lg px-2 py-1.5 sm:mt-2 sm:rounded-xl sm:px-4 sm:py-2.5">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-primary" aria-hidden>
                  <Waveform spectrumRef={spectrumRef} active={phase === "listening"} />
                </div>
                <div className="relative h-8 sm:h-12" aria-hidden />
              </div>

              <p
                aria-live="polite"
                className="mt-1.5 line-clamp-1 min-h-5 px-1 text-xs leading-5 text-foreground sm:mt-2 sm:line-clamp-2 sm:min-h-[2.75rem] sm:text-sm sm:leading-6"
              >
                {transcript ? (
                  <>
                    <span className="transcript-final">{finalText}</span>{" "}
                    <span className="transcript-interim">{interimText}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Listening for the patient details…</span>
                )}
              </p>

              {liveTextUnavailable && (
                <p className="mt-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground" role="status">
                  Live transcription is unavailable. Recording continues and the final transcript will still be processed.
                </p>
              )}

              {approachingLimit && (
                /* A countdown the doctor has to act on inside ten seconds. It
                   was 11px, which is unreadable at arm's length on a phone held
                   at a bedside — the one place this message is ever shown. */
                <p className="mt-1.5 rounded-xl border border-warning/20 bg-warning/8 px-3 py-2 text-xs font-medium text-warning" role="status">
                  {Math.ceil(remainingMs / 1000)} seconds left — wrap up this patient.
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
              className="flex min-h-16 items-center gap-3 px-3 py-2"
            >
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                {!reduceMotion && (
                  <motion.span
                    className="pointer-events-none absolute inset-0 rounded-full border border-primary/35"
                    animate={{ scale: [1, 1.45], opacity: [0.75, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    aria-hidden
                  />
                )}
                <AudioLines className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {phase === "transcribing" ? "Creating the transcript" : "Structuring the visit"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {phase === "transcribing"
                    ? "Turning your dictation into clinical text…"
                    : "Finding the patient, diagnosis and prescription…"}
                </p>
              </div>
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
              className="voice-dock-query surface-inset flex h-14 min-w-0 items-center gap-2 rounded-lg px-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary">
                <Search className="size-4" aria-hidden />
              </span>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What did I prescribe Sunita last time?"
                aria-label="Ask about a patient's history"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!question.trim()}
                className="grid size-9 shrink-0 touch-manipulation place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
              >
                <SendHorizontal className="size-4" aria-hidden />
                <span className="sr-only">Ask patient history</span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <OfflineNotice
          offline={offline}
          heldRecording={offlineHold}
          onSend={sendHeldRecording}
          onManualEntry={onManualEntry}
        />

        {/* The notice above says all of this better when the network is why the
            upload failed, and says it without the raw "try again" that sends a
            doctor back into a retry that cannot work yet. */}
        {error && !offlineHold && (
          <div className="col-span-full mt-2 flex flex-col gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-xs text-destructive">{error}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canRetryTranscription && (
                <Button type="button" size="sm" onClick={onRetryTranscription}>
                  Retry transcription
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={onManualEntry}>
                <FilePenLine className="size-4" aria-hidden />
                Enter manually
              </Button>
            </div>
          </div>
        )}

        {/* ---- The key ---------------------------------------------------- */}
        <div
          className={cn(
            "flex items-center justify-center gap-3",
            listening || busy ? "mt-2 pb-0.5 sm:mt-3 sm:pb-1" : "mt-0",
          )}
        >
          {listening ? (
            <>
              <Button variant="outline" size="icon" onClick={onCancel} className="size-11 rounded-full">
                <X className="size-4" aria-hidden />
                <span className="sr-only">Discard recording</span>
              </Button>
              <div className="relative">
                {!reduceMotion && (
                  <motion.span
                    className="pointer-events-none absolute -inset-2 rounded-full border border-destructive/35"
                    animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                    transition={{ duration: 1.35, repeat: Infinity, ease: "easeOut" }}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={handleToggle}
                  className="pressable relative z-10 grid size-14 touch-manipulation place-items-center rounded-full border border-destructive bg-destructive text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:size-16"
                >
                  <Square className="size-5 fill-current" aria-hidden />
                  <span className="sr-only">Stop recording and review this visit</span>
                </button>
              </div>
            </>
          ) : busy ? (
            <span className="relative grid size-12 place-items-center rounded-full border border-primary/20 bg-primary-soft text-primary" aria-hidden>
              <AudioLines className="size-5" />
            </span>
          ) : (
            <div className="relative flex flex-col items-center">
              <div className="relative grid place-items-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleToggle}
                    aria-pressed={false}
                    style={{ transform: `scale(${reduceMotion ? 1 : 1 + level * 0.1})` }}
                    className={cn(
                      "relative grid touch-manipulation place-items-center rounded-full border border-primary bg-primary text-primary-foreground shadow-flat transition-[transform,background-color] duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-50",
                      "size-14",
                    )}
                    aria-label="Start recording a visit"
                  >
                    <Mic className="size-5" aria-hidden />
                  </button>
              </div>
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
