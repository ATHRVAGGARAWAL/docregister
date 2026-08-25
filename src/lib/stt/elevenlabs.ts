import "server-only";

import { env } from "@/lib/env";
import {
  STT_TIMEOUT_MS,
  SttError,
  type SttProvider,
  type TranscribeInput,
  type TranscribeResult,
} from "./types";

const MODEL = "scribe_v2";

/**
 * ElevenLabs Scribe v2 — fallback provider.
 *
 * Second-best measured Indic accuracy (Hindi 7.7 / Punjabi 15.6 WER) and the
 * only non-Indian vendor with an actual India storage region. Note the caveat
 * before relying on that for compliance: storage is in-region but processing
 * may still occur outside India via affiliates, so it satisfies "data
 * residency" in the marketing sense and not necessarily ABDM's storage
 * requirement. Treat it as a degraded-mode fallback when Sarvam is down, not
 * as an equivalent primary.
 *
 * Punjabi is tiered by ElevenLabs' own docs as "Good" (10–25% WER) against
 * Hindi's "High Accuracy" (5–10%) — so a Punjabi-heavy clinic should not be
 * silently failed over here without telling the doctor.
 */
export class ElevenLabsProvider implements SttProvider {
  readonly name = "elevenlabs";
  readonly supportsLive = false;

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const apiKey = env.elevenLabsApiKey;
    if (!apiKey) {
      throw new SttError("ELEVENLABS_API_KEY is not configured", "auth");
    }

    const blob =
      input.audio instanceof Blob
        ? input.audio
        : new Blob([new Uint8Array(input.audio)], { type: input.mimeType });

    if (blob.size === 0) {
      throw new SttError("Empty audio payload", "empty_audio");
    }

    const form = new FormData();
    form.append("file", blob, "audio");
    form.append("model_id", MODEL);
    form.append("tag_audio_events", "false");
    if (input.languageHint && input.languageHint !== "unknown") {
      // ElevenLabs expects a bare ISO-639 code, not the full BCP-47 tag.
      form.append("language_code", input.languageHint.split("-")[0]);
    }
    // `keyterms` is a list, sent as repeated form fields — NOT a JSON array.
    // ElevenLabs forbids < > { } [ ] \ inside a term, so `JSON.stringify` on the
    // array produces a single term full of brackets and quotes and the whole
    // request 400s with "Some keyword contains invalid characters" — taking the
    // transcription down with it rather than just losing the vocabulary boost.
    //
    // The other documented limits (≤50 chars, ≤5 words) are enforced here for
    // the same reason: a drug name that trips one of them must not be able to
    // fail a doctor's dictation. Capped at 100 because each term carries a 20%
    // surcharge on the transcription, and the tail of a top-40 list is noise.
    const keyterms = (input.vocabularyHints ?? [])
      .map((term) => term.replace(/[<>{}[\]\\]/g, " ").replace(/\s+/g, " ").trim())
      .filter((term) => term.length > 0 && term.length < 50 && term.split(" ").length <= 5)
      .slice(0, 100);
    for (const term of keyterms) form.append("keyterms", term);

    let response: Response;
    try {
      response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "TimeoutError") {
        throw new SttError("ElevenLabs did not respond in time", "provider_error", true);
      }
      throw new SttError(`Could not reach ElevenLabs: ${String(cause)}`, "provider_error", true);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SttError(
        `ElevenLabs returned ${response.status}: ${body.slice(0, 300)}`,
        response.status === 401 ? "auth" : "provider_error",
        response.status >= 500 || response.status === 429,
      );
    }

    const json = (await response.json()) as {
      text?: string;
      language_code?: string;
      language_probability?: number;
    };

    const text = (json.text ?? "").trim();
    if (!text) throw new SttError("ElevenLabs returned no text", "empty_audio");

    return {
      text,
      detectedLanguage: json.language_code,
      confidence: json.language_probability,
      durationMs: input.durationMs,
      provider: this.name,
      model: MODEL,
    };
  }
}
