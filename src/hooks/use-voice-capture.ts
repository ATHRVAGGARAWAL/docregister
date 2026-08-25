"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LiveTranscriptSocket } from "@/lib/audio/live-transcript";
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
  onDraft?: (draft: CaptureDraft) => void;
}

/** Sarvam's synchronous endpoint rejects audio over ~30s. */
const SOFT_LIMIT_MS = 27_000;
const HARD_LIMIT_MS = 29_000;

export function useVoiceCapture(options: UseVoiceCaptureOptions = {}) {
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const socketRef = useRef<LiveTranscriptSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const spectrumRef = useRef<Uint8Array>(new Uint8Array(0));
  // Guards the whole async tail against a component that unmounts mid-flight —
  // a real risk here, because the doctor can navigate away while the LLM runs.
  const aliveRef = useRef(true);

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
    setLocked(false);
  }, []);

  const start = useCallback(async () => {
    if (phase === "listening" || phase === "arming") return;

    setError(null);
    setDraft(null);
    setInterimText("");
    setFinalText("");
    setElapsedMs(0);
    setPhase("arming");

    const recorder = new VoiceRecorder({
      onLevel: (value, spectrum) => {
        spectrumRef.current = spectrum;
        setLevel(value);
      },
      onPcmFrame: (frame) => socketRef.current?.send(frame),
      onError: () => {
        // Live path only. Never surfaced as a hard error: the recording is fine.
      },
    });
    recorderRef.current = recorder;

    if (options.accessToken && options.liveProxyUrl) {
      const socket = new LiveTranscriptSocket({
        url: options.liveProxyUrl,
        token: options.accessToken,
        languages: options.languages ?? ["hi-IN", "en-IN"],
        onEvent: (event) => {
          if (!aliveRef.current) return;
          if (event.type === "interim") setInterimText(event.text);
          if (event.type === "final") {
            setFinalText((prev) => (prev ? `${prev} ${event.text}` : event.text));
            setInterimText("");
          }
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

    if (!aliveRef.current) {
      recorder.cancel();
      return;
    }

    startedAtRef.current = performance.now();
    setPhase("listening");
    timerRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);
  }, [options.accessToken, options.languages, options.liveProxyUrl, phase, teardownCapture]);

  const process = useCallback(
    async (recording: RecordingResult) => {
      setPhase("transcribing");

      const form = new FormData();
      form.append("audio", recording.blob, `dictation.${extensionFor(recording.mimeType)}`);
      form.append("mimeType", recording.mimeType);
      form.append("durationMs", String(Math.round(recording.durationMs)));
      form.append("sampleRate", String(recording.sampleRate));
      form.append("liveText", finalText);
      if (options.languages?.length) {
        form.append("languages", options.languages.join(","));
      }

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

        const next: CaptureDraft = {
          encounterId: extracted.encounterId,
          transcriptId: transcribed.transcriptId,
          rawText: transcribed.text ?? "",
          romanText: transcribed.romanText ?? null,
          languageCode: transcribed.languageCode ?? null,
          extraction: extracted.extraction,
          degraded: Boolean(transcribed.degraded),
          warnings: extracted.warnings ?? [],
          suggestedPatients: extracted.suggestedPatients ?? [],
        };
        setDraft(next);
        setPhase("review");
        options.onDraft?.(next);
      } catch (cause) {
        if (!aliveRef.current) return;
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [finalText, options],
  );

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || phase !== "listening") return;

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

  // Auto-stop at the provider's hard ceiling rather than letting the upload be
  // rejected after the doctor has already finished speaking.
  useEffect(() => {
    if (phase !== "listening") return;
    if (elapsedMs < HARD_LIMIT_MS) return;
    void stop();
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
    locked,
    setLocked,
    approachingLimit: phase === "listening" && elapsedMs > SOFT_LIMIT_MS,
    remainingMs: Math.max(0, HARD_LIMIT_MS - elapsedMs),
    start,
    stop,
    cancel,
    reset,
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
