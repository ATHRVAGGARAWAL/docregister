"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LiveTranscriptSocket } from "@/lib/audio/live-transcript";
import { RECORDING_LIMIT_MS, RECORDING_WARNING_MS } from "@/lib/audio/limits";
import { VoiceRecorder, type RecordingResult } from "@/lib/audio/recorder";
import type { Extraction } from "@/lib/llm/schema";

/**
 * The capture state machine.
 *
 * These phases exist because each one has a different failure mode and a
 * different thing to show the doctor. Collapsing them into a single `loading`
 * boolean is how you end up with a spinner that means five different things
 * and a user who cannot tell whether it is safe to walk away.
 */
export type CapturePhase =
  | "idle"
  | "arming" // permission prompt / audio graph warming up
  | "listening"
  | "transcribing" // audio uploaded, waiting on STT
  | "extracting" // transcript in hand, waiting on the LLM
  | "review" // structured draft ready for human confirmation
  | "error";

export interface CaptureDraft {
  encounterId: string;
  transcriptId: string;
  rawText: string;
  romanText: string | null;
  languageCode: string | null;
  extraction: Extraction;
  /** True when the transcript came from the fallback STT engine. */
  degraded: boolean;
  /** Fields the extractor was unsure about, plus our own range checks. */
  warnings: string[];
  /** Existing charts the spoken name might refer to. Never auto-linked. */
  suggestedPatients: PatientMatch[];
}

/**
 * A finished recording, carried whole rather than as a bare id.
 *
 * This is what the hook hands back when the utterance turns out to have been a
 * question, and everything needed to build a draft from it is included —
 * because the escape hatch out of a misclassification, "Record as a visit
 * instead", passes this same object straight back to `recordAsVisit`. Holding
 * it in the caller's hands rather than in a ref inside the hook is what stops a
 * second recording, made in between, from being the one that gets filed.
 */
export interface CaptureTranscript {
  /** The transcript. When this was a question, it is also the question. */
  text: string;
  /** Row id of the transcript of record. Extraction can still be run on it. */
  transcriptId: string;
  romanText: string | null;
  languageCode: string | null;
  degraded: boolean;
}

export interface PatientMatch {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  last_visit: string | null;
  visit_count: number | null;
}

export interface UseVoiceCaptureOptions {
  /** Supabase access token, for the live proxy. Omit to skip live text. */
  accessToken?: string;
  liveProxyUrl?: string;
  languages?: string[];
  /**
   * The recording turned out to be a question, so no draft was created and
   * there is nothing to review. Whoever owns the recall UI takes it from here.
   *
   * Delivered as an event rather than left on the hook as state, because that
   * is what it is: the caller has to *do* something once per question — ask it
   * — and a caller watching a state field for that has to work out for itself
   * which renders are the new ones.
   *
   * The transcript is handed over whole rather than as a bare id so the caller
   * can pass this same object back to `recordAsVisit` if the classification was
   * wrong. Holding it in the caller's hands rather than in a ref in here is
   * what stops a second recording, made in between, from being the one filed.
   */
  onQuestion?: (transcript: CaptureTranscript) => void;
}

/** Hindi first, Indian English second — what most dictation here is a mix of. */
const DEFAULT_LANGUAGES = ["hi-IN", "en-IN"];

export function useVoiceCapture(options: UseVoiceCaptureOptions = {}) {
  const { accessToken, liveProxyUrl } = options;
  // Reduced to the string the request actually carries, because `languages` is
  // an array most callers build inline: its identity changes on every render of
  // the caller, including the ten renders a second the elapsed timer causes
  // while recording. Depending on the value instead of the reference is what
  // keeps `process`, `stop` and the auto-stop effect from being rebuilt
  // throughout a recording.
  const languageParam = options.languages?.length ? options.languages.join(",") : "";

  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracked apart from `phase` on purpose. Live text is feedback; the
  // MediaRecorder blob is the transcript of record, and it keeps being written
  // whatever happens to the socket. So this never moves the state machine — it
  // exists only so the dock can stop claiming to be listening for words it can
  // no longer hear.
  const [liveTextUnavailable, setLiveTextUnavailable] = useState(false);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const socketRef = useRef<LiveTranscriptSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const spectrumRef = useRef<Uint8Array>(new Uint8Array(0));
  // Guards the whole async tail against a component that unmounts mid-flight —
  // a real risk here, because the doctor can navigate away while the LLM runs.
  const aliveRef = useRef(true);
  // Read through a ref so `process` does not depend on the caller having
  // memoised its handler. Most callers will pass an inline arrow, and depending
  // on it directly would rebuild `process`, then `stop`, then the auto-stop
  // effect on every render — which is ten times a second throughout a
  // recording, because the elapsed timer is re-rendering the caller. This is
  // the same hazard `languageParam` above is flattened to a string to avoid.
  const onQuestionRef = useRef(options.onQuestion);
  useEffect(() => {
    onQuestionRef.current = options.onQuestion;
  });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      recorderRef.current?.cancel();
      socketRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const teardownCapture = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setLevel(0);
    // The indicator described a recording that is now over. Carrying it into
    // the review sheet would read as a warning about the draft, which it is
    // not: the draft comes from the uploaded audio, not from the live socket.
    setLiveTextUnavailable(false);
  }, []);

  const start = useCallback(async () => {
    if (phase === "listening" || phase === "arming") return;

    setError(null);
    setDraft(null);
    setInterimText("");
    setFinalText("");
    setElapsedMs(0);
    setLiveTextUnavailable(false);
    setPhase("arming");

    const recorder = new VoiceRecorder({
      onLevel: (value, spectrum) => {
        spectrumRef.current = spectrum;
        setLevel(value);
      },
      onPcmFrame: (frame) => socketRef.current?.send(frame),
      onError: () => {
        // The recorder raises this when the PCM worklet fails to load, which
        // leaves the socket connected and permanently silent — the same empty
        // dock as a proxy that is down, so it gets the same indicator. Still
        // not a hard error: the MediaRecorder branch is untouched and the
        // recording the chart is built from is being written as normal.
        if (!aliveRef.current) return;
        setLiveTextUnavailable(true);
        // Nothing will ever be sent down it now, and an idle authenticated
        // socket still holds an upstream connection the clinic is paying for.
        socketRef.current?.close();
        socketRef.current = null;
      },
    });
    recorderRef.current = recorder;

    if (accessToken && liveProxyUrl) {
      const socket = new LiveTranscriptSocket({
        url: liveProxyUrl,
        token: accessToken,
        languages: languageParam ? languageParam.split(",") : DEFAULT_LANGUAGES,
        onEvent: (event) => {
          if (!aliveRef.current) return;
          if (event.type === "interim") {
            setInterimText(event.text);
            return;
          }
          if (event.type === "final") {
            setFinalText((prev) => (prev ? `${prev} ${event.text}` : event.text));
            setInterimText("");
            return;
          }

          // A dead feed and a quiet room produce an identical dock — "Listening…"
          // and no text — and the doctor cannot tell which one they are looking
          // at. The socket has already worked out which it is by the time it
          // says `unavailable`, having spent its retries; carry that through.
          if (event.state === "unavailable") setLiveTextUnavailable(true);
          // A reconnect that lands means interim text is flowing again.
          if (event.state === "open") setLiveTextUnavailable(false);
          // `connecting` is the socket still trying, which is what the plain
          // "Listening…" placeholder already conveys. `closed` only ever follows
          // our own teardown, which has already decided what the dock shows
          // next — and acting on it here would wipe the indicator the worklet
          // failure above just set before the doctor could read it.
        },
      });
      socketRef.current = socket;
      socket.connect();
    }

    try {
      // Not awaited before the recorder starts elsewhere: `start()` must be
      // reached from the gesture, so this call is the first await in the chain.
      await recorder.start();
    } catch (cause) {
      // Cancel can happen while the browser permission sheet is still open.
      // That deliberately retires this recorder, so its eventual AbortError (or
      // a WebKit InvalidStateError caused by closing its AudioContext) must not
      // replace the idle UI with a false hardware error.
      if (recorderRef.current !== recorder) return;
      teardownCapture();
      recorderRef.current = null;
      if (!aliveRef.current) return;
      const name = (cause as DOMException)?.name;
      setError(
        // Already written for the doctor by the recorder's preflight, and more
        // specific than anything that can be reconstructed from the name here.
        name === "MicUnavailableError"
          ? (cause as Error).message
          : name === "NotAllowedError"
            ? "Microphone access was blocked. Enable it in your browser settings and try again."
            : name === "NotFoundError"
              ? "No microphone found on this device."
              : "Could not start recording on this device.",
      );
      setPhase("error");
      return;
    }

    if (!aliveRef.current || recorderRef.current !== recorder) {
      recorder.cancel();
      return;
    }

    startedAtRef.current = performance.now();
    setPhase("listening");
    timerRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);
  }, [accessToken, languageParam, liveProxyUrl, phase, teardownCapture]);

  const process = useCallback(
    async (recording: RecordingResult) => {
      setPhase("transcribing");

      const form = new FormData();
      form.append("audio", recording.blob, `dictation.${extensionFor(recording.mimeType)}`);
      form.append("mimeType", recording.mimeType);
      form.append("durationMs", String(Math.round(recording.durationMs)));
      form.append("sampleRate", String(recording.sampleRate));
      form.append("liveText", finalText);
      if (languageParam) form.append("languages", languageParam);

      try {
        const transcribeResponse = await fetch("/api/encounters/transcribe", {
          method: "POST",
          body: form,
        });
        const transcribed = await readJson(transcribeResponse);
        if (!aliveRef.current) return;

        setFinalText(transcribed.text ?? "");
        setInterimText("");
        setPhase("extracting");

        const extractResponse = await fetch("/api/encounters/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptId: transcribed.transcriptId }),
        });
        const extracted = await readJson(extractResponse);
        if (!aliveRef.current) return;

        // "Pull up Sunita's records" comes through the same key as a
        // consultation, and the extractor is where the two are told apart. No
        // draft was created for a question, so there is nothing to review and
        // nothing to discard — the recording ends here and the caller takes the
        // text to recall.
        const captured = capturedFrom(transcribed);

        if (extracted.kind === "question") {
          setPhase("idle");
          onQuestionRef.current?.(captured);
          return;
        }

        setDraft(draftFrom(captured, extracted));
        setPhase("review");
      } catch (cause) {
        if (!aliveRef.current) return;
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [finalText, languageParam],
  );

  /**
   * File a recording as a visit after the classifier called it a question.
   *
   * This is the recovery for the dangerous direction of the mistake. Nothing
   * was lost when it happened — `/api/encounters/transcribe` had already
   * written the transcript row — so this is only the extraction that was
   * skipped, run against the same words with the classifier told to stay out
   * of it. The extract route reuses the draft it already holds for a
   * transcript, so pressing this twice produces one draft, not two.
   */
  const recordAsVisit = useCallback(async (transcript: CaptureTranscript) => {
    setError(null);
    setPhase("extracting");

    try {
      const response = await fetch("/api/encounters/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptId: transcript.transcriptId,
          treatAs: "dictation",
        }),
      });
      const extracted = await readJson(response);
      if (!aliveRef.current) return;

      setDraft(draftFrom(transcript, extracted));
      setPhase("review");
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not record that as a visit.");
      setPhase("error");
    }
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    // "Arming" includes the permission prompt. getUserMedia cannot itself be
    // aborted, but VoiceRecorder.cancel() marks the attempt as retired and will
    // stop any stream that arrives later. This makes the visible Stop control a
    // real escape hatch instead of a no-op while the timer is frozen at 0:00.
    if (phase === "arming") {
      recorder.cancel();
      recorderRef.current = null;
      teardownCapture();
      setInterimText("");
      setFinalText("");
      setElapsedMs(0);
      setPhase("idle");
      return;
    }

    if (phase !== "listening") return;

    teardownCapture();
    recorderRef.current = null;

    let recording: RecordingResult;
    try {
      recording = await recorder.stop();
    } catch {
      if (!aliveRef.current) return;
      setError("The recording could not be finalised.");
      setPhase("error");
      return;
    }

    if (!aliveRef.current) return;

    // An empty blob is what a blocked-but-not-errored microphone looks like on
    // iOS. Failing loudly here beats sending silence to the STT engine and
    // showing the doctor an empty draft with no explanation.
    if (recording.blob.size < 1024) {
      setError("No audio was captured. Check that the microphone is not muted.");
      setPhase("error");
      return;
    }

    await process(recording);
  }, [phase, process, teardownCapture]);

  const cancel = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    teardownCapture();
    setInterimText("");
    setFinalText("");
    setElapsedMs(0);
    setPhase("idle");
  }, [teardownCapture]);

  const reset = useCallback(() => {
    setDraft(null);
    setError(null);
    setInterimText("");
    setFinalText("");
    setElapsedMs(0);
    setPhase("idle");
  }, []);

  // Stop at one minute so a consultation stays bounded and the upload remains
  // reliable on a clinic's mobile connection.
  useEffect(() => {
    if (phase !== "listening") return;
    if (elapsedMs < RECORDING_LIMIT_MS) return;
    // Cross the effect boundary through a task. `stop` intentionally performs
    // immediate UI teardown before awaiting MediaRecorder, which should not be
    // invoked synchronously from an effect body.
    const timeout = window.setTimeout(() => void stop(), 0);
    return () => window.clearTimeout(timeout);
  }, [elapsedMs, phase, stop]);

  return {
    phase,
    level,
    elapsedMs,
    /** Live spectrum for the waveform. Read via ref to avoid re-rendering at 60fps. */
    spectrumRef,
    interimText,
    finalText,
    draft,
    error,
    /**
     * The live transcript has given up for this recording — the proxy is
     * unreachable or the PCM worklet never loaded. The capture itself is
     * unaffected, so this belongs next to "Listening…" as a note, not as an
     * error and never as colour alone.
     */
    liveTextUnavailable,
    approachingLimit: phase === "listening" && elapsedMs > RECORDING_WARNING_MS,
    remainingMs: Math.max(0, RECORDING_LIMIT_MS - elapsedMs),
    start,
    stop,
    cancel,
    reset,
    recordAsVisit,
  };
}

/** Shape of the transcribe route's reply, as far as this hook reads it. */
interface TranscribePayload {
  transcriptId: string;
  text?: string | null;
  romanText?: string | null;
  languageCode?: string | null;
  degraded?: boolean;
}

/** Shape of an extract-route reply that produced a draft. */
interface ExtractPayload {
  encounterId: string;
  extraction: Extraction;
  warnings?: string[];
  suggestedPatients?: PatientMatch[];
}

function capturedFrom(transcribed: TranscribePayload): CaptureTranscript {
  return {
    text: transcribed.text ?? "",
    transcriptId: transcribed.transcriptId,
    romanText: transcribed.romanText ?? null,
    languageCode: transcribed.languageCode ?? null,
    degraded: Boolean(transcribed.degraded),
  };
}

/**
 * Written once and used by both routes into review, so that a visit recovered
 * from a misread question carries exactly the same transcript, language and
 * degraded flag as one that was never misread.
 */
function draftFrom(transcript: CaptureTranscript, extracted: ExtractPayload): CaptureDraft {
  return {
    encounterId: extracted.encounterId,
    transcriptId: transcript.transcriptId,
    rawText: transcript.text,
    romanText: transcript.romanText,
    languageCode: transcript.languageCode,
    extraction: extracted.extraction,
    degraded: transcript.degraded,
    warnings: extracted.warnings ?? [],
    suggestedPatients: extracted.suggestedPatients ?? [],
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload;
}
