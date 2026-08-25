import "server-only";

import { env } from "@/lib/env";
import {
  STT_TIMEOUT_MS,
  SttError,
  type SttProvider,
  type TranscribeInput,
  type TranscribeResult,
} from "./types";

const SARVAM_BASE = "https://api.sarvam.ai";

/** Sarvam's synchronous endpoint rejects audio longer than ~30 seconds. */
export const SARVAM_SYNC_LIMIT_MS = 29_000;

const MODEL = "saaras:v3";

/**
 * Sarvam AI — default provider.
 *
 * Chosen for measured Hindi 5.0 / Punjabi 11.2 WER (best of any engine tested)
 * and because it is India-hosted, which ABDM's Health Data Management Policy
 * effectively requires for stored patient data.
 *
 * Two things about this API drive the design elsewhere in the app:
 *
 *  1. The sync endpoint caps at ~30s. Longer dictations must go through the
 *     realtime WebSocket (see `server/stt-proxy.ts`) or Sarvam's Batch API.
 *  2. The realtime socket only accepts raw mono PCM at 8k or 16k. MediaRecorder
 *     cannot produce raw PCM, which is why the client runs an AudioWorklet
 *     downsampler rather than just streaming recorder chunks.
 */
export class SarvamProvider implements SttProvider {
  readonly name = "sarvam";
  readonly supportsLive = true;

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    if (input.durationMs && input.durationMs > SARVAM_SYNC_LIMIT_MS) {
      throw new SttError(
        `Recording is ${Math.round(input.durationMs / 1000)}s; the Sarvam sync ` +
          `endpoint accepts ~30s. Use the live WebSocket transcript for this ` +
          `encounter, or route it through Sarvam's Batch API.`,
        "too_long",
      );
    }

    // Sarvam checks the Content-Type of the multipart part against a fixed list
    // by exact string match, so `audio/webm;codecs=opus` — which is precisely
    // what MediaRecorder reports and what the client forwards — comes back as
    // "Invalid file type", while the same bytes labelled `audio/webm` transcribe
    // fine. Send the essence type and keep the parameters out of it.
    const contentType = essence(
      input.mimeType || (input.audio instanceof Blob ? input.audio.type : ""),
    );
    const bytes =
      input.audio instanceof Blob ? input.audio : new Uint8Array(input.audio);
    const blob = new Blob([bytes], { type: contentType });

    if (blob.size === 0) {
      throw new SttError("Empty audio payload", "empty_audio");
    }

    const form = new FormData();
    form.append("file", blob, filenameFor(contentType));
    form.append("model", MODEL);
    // `codemix` is the whole reason this provider was chosen — it is built for
    // English mixed into Hindi/Punjabi inside a single utterance.
    form.append("mode", input.mode ?? "codemix");
    form.append("language_code", input.languageHint ?? "unknown");

    let response: Response;
    try {
      response = await fetch(`${SARVAM_BASE}/speech-to-text`, {
        method: "POST",
        headers: { "api-subscription-key": env.sarvamApiKey },
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "TimeoutError") {
        throw new SttError("Sarvam did not respond in time", "provider_error", true);
      }
      throw new SttError(`Could not reach Sarvam: ${String(cause)}`, "provider_error", true);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new SttError("Sarvam rejected the API key", "auth");
      }
      if (response.status === 429) {
        throw new SttError("Sarvam rate limit hit", "rate_limited", true);
      }
      throw new SttError(
        `Sarvam returned ${response.status}: ${body.slice(0, 300)}`,
        "provider_error",
        response.status >= 500,
      );
    }

    const json = (await response.json()) as {
      transcript?: string;
      language_code?: string;
      diarized_transcript?: unknown;
    };

    const text = (json.transcript ?? "").trim();
    if (!text) {
      throw new SttError("Sarvam returned an empty transcript", "empty_audio");
    }

    return {
      text,
      detectedLanguage: json.language_code,
      durationMs: input.durationMs,
      provider: this.name,
      model: MODEL,
    };
  }

  /**
   * Second pass in `translit` mode to get a romanised rendering.
   *
   * Worth the extra call: a doctor scanning a note on a phone reads
   * "bukhar teen din se" far faster than the Devanagari, and code-mixed
   * English drug names come back in a consistent script instead of being
   * transliterated differently on every run.
   */
  async romanise(input: TranscribeInput): Promise<string | undefined> {
    try {
      const result = await this.transcribe({ ...input, mode: "translit" });
      return result.text;
    } catch {
      // Purely a nicety — never fail the encounter over it.
      return undefined;
    }
  }
}

/** `audio/webm;codecs=opus` -> `audio/webm`. */
function essence(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
}

function filenameFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "audio.m4a";
  if (mimeType.includes("webm")) return "audio.webm";
  if (mimeType.includes("ogg")) return "audio.ogg";
  if (mimeType.includes("wav")) return "audio.wav";
  return "audio.bin";
}
