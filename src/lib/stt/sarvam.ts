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
 * Budget for the romanisation pass, deliberately well under `STT_TIMEOUT_MS`.
 *
 * `romanise` is a second full transcription of the same audio, and it runs
 * *after* the transcript of record has already come back. Given the primary
 * budget it could spend another 20s of the route's 60s, and a request killed at
 * `maxDuration` dies before `create_transcript_workflow` runs — so a stalled
 * transliteration would throw away a transcription that had already succeeded.
 * The worst case here must be a missing romanisation, never a missing
 * transcript, and 8s is enough for a pass that normally returns in two or three.
 */
const ROMANISE_TIMEOUT_MS = 8_000;

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
    return this.requestTranscript(input, STT_TIMEOUT_MS);
  }

  private async requestTranscript(
    input: TranscribeInput,
    timeoutMs: number,
  ): Promise<TranscribeResult> {
    if (input.durationMs && input.durationMs > SARVAM_SYNC_LIMIT_MS) {
      // Retryable, and that word means something specific here: `index.ts`
      // gates *failover to the other provider* on it, not a second call to this
      // one. "Longer than Sarvam's sync endpoint accepts" is precisely the
      // failure a different provider can change — ElevenLabs declares no
      // duration ceiling, and the recorder lets a doctor speak for 60s
      // (RECORDING_LIMIT_MS), warning only at 50s.
      //
      // Left non-retryable, a Sarvam-primary deployment fails every dictation
      // over 29s outright, and tells the doctor "that recording was too long"
      // about a length the app had just invited. If both providers refuse, that
      // message is reached anyway and is then true.
      throw new SttError(
        `Recording is ${Math.round(input.durationMs / 1000)}s; the Sarvam sync ` +
          `endpoint accepts ~30s. Use the live WebSocket transcript for this ` +
          `encounter, or route it through Sarvam's Batch API.`,
        "too_long",
        true,
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
        signal: AbortSignal.timeout(timeoutMs),
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

    // `fetch` resolves once the headers land; the body is still streaming. A
    // provider that answers 200 and then stalls, or that is fronted by a proxy
    // returning an HTML error page, fails here rather than above — and this
    // used to throw a raw DOMException/SyntaxError past every `SttError`
    // handler, so `transcribeWithFailover` could not see it was retryable and
    // the encounter died instead of failing over. The timeout signal covers
    // this read too; it just surfaces at a different line.
    let json: {
      transcript?: string;
      language_code?: string;
      diarized_transcript?: unknown;
    };
    try {
      json = await response.json();
    } catch (cause) {
      throw new SttError(
        `Sarvam's response did not complete: ${String(cause)}`,
        "provider_error",
        true,
      );
    }

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
      const result = await this.requestTranscript(
        { ...input, mode: "translit" },
        ROMANISE_TIMEOUT_MS,
      );
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
