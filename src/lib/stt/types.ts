/**
 * Provider-neutral speech-to-text seam.
 *
 * Everything above this interface is written against `SttProvider`, never
 * against a vendor. That matters more than usual here: the accuracy gap
 * between engines on code-mixed Hindi/Punjabi is enormous and the leader will
 * change. Independent benchmarking (Voice of India, arXiv 2604.19151, May 2026)
 * put word error rate on unscripted Hindi / Punjabi at:
 *
 *   Sarvam Saaras          5.0 / 11.2   <- default
 *   Gemini 3 Pro           6.0 / 14.4
 *   ElevenLabs Scribe v2   7.7 / 15.6   <- fallback
 *   IndicConformer-600M    8.2 / 14.9   (open weights, self-hostable)
 *   Deepgram Nova-3       13.0 /  n/a   (no Punjabi support at all)
 *   AssemblyAI Universal  19.3 / 101.0  (accepts Punjabi, returns garbage)
 *   GPT-4o-transcribe     33.9 / 70.1
 *
 * A WER above 100 is not a typo — it is what silent degradation looks like.
 * The API accepts the request and returns fluent nonsense. Swapping providers
 * must therefore be a config change, and every provider must report which
 * language it actually detected so we can spot a collapse in production.
 */

export type SttMode =
  /** Straight transcription in the source script. */
  | "transcribe"
  /** Explicit code-mixed handling — the default for doctor dictation. */
  | "codemix"
  /** Romanised Latin-script output; easier to skim on a phone. */
  | "translit"
  /** Word-for-word including disfluencies. */
  | "verbatim";

export interface TranscribeInput {
  audio: Blob | Buffer;
  mimeType: string;
  /** Read from `AudioContext.sampleRate` on the client — never assumed. */
  sampleRate?: number;
  durationMs?: number;
  /** BCP-47 hint, or "unknown" to let the engine detect. */
  languageHint?: string;
  mode?: SttMode;
  /**
   * Vocabulary bias. A full Indian formulary is far too large to send, so the
   * caller passes a per-encounter subset: this doctor's most-prescribed drugs
   * plus the patient's active medication list. Not every provider supports it.
   */
  vocabularyHints?: string[];
}

export interface TranscribeResult {
  /** Provider output, shown verbatim to the doctor. Never LLM-rewritten. */
  text: string;
  /** Romanised form when the provider can produce one. */
  romanText?: string;
  detectedLanguage?: string;
  durationMs?: number;
  provider: string;
  model: string;
  /** Present only when the provider reports one; do not synthesise a value. */
  confidence?: number;
}

export interface SttProvider {
  readonly name: string;
  /**
   * The durable path. Its output is the transcript of record for the clinical
   * document — the live WebSocket stream is only UI feedback.
   */
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
  /** Whether this provider can accept a live PCM stream via the proxy. */
  readonly supportsLive: boolean;
}

export class SttError extends Error {
  constructor(
    message: string,
    readonly code:
      | "too_long"
      | "unsupported_format"
      | "auth"
      | "rate_limited"
      | "provider_error"
      | "empty_audio",
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "SttError";
  }
}

/**
 * How long a single STT request may take before it is abandoned.
 *
 * Nothing in this app had a timeout. A provider that accepts the connection and
 * then stalls held the route open for its full `maxDuration = 60`, with the
 * doctor watching a spinner, and then failed anyway — and when the primary
 * stalls, the failover leg would serialise a second unbounded wait inside the
 * same budget. 20s leaves room for both legs plus the surrounding work.
 *
 * A timeout is `retryable`, which is what makes it fail *over* rather than just
 * fail: a stalled vendor is exactly the case the second provider exists for.
 */
export const STT_TIMEOUT_MS = 20_000;
