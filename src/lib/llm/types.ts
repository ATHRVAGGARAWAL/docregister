import "server-only";

import type * as z from "zod/v4";

/**
 * The seam between this app's prompts and whichever model actually runs them.
 *
 * Everything clinically load-bearing — the extraction rules, the numeral
 * tables, the "never invent a value" instruction — lives in `extract.ts` and
 * `recall.ts` and is written once, provider-agnostically. A provider adapter
 * is only responsible for three mechanical things: getting a system prompt and
 * a user turn to the model, forcing the response to match a Zod schema, and
 * turning that vendor's failures into a `LlmError` this app already knows how
 * to show a doctor.
 *
 * That split is what makes swapping the LLM a contained change. It matters
 * more here than in most apps: PHI must stay in India (ABDM's Health Data
 * Management Policy), which constrains *where* a model may run, and that
 * constraint changes independently of anything clinical. Being able to move to
 * a differently-hosted model without reopening a single prompt is the point.
 */

export type LlmErrorCode =
  | "auth"
  | "rate_limited"
  /** A content filter refused the request or the response. */
  | "blocked"
  /** The model answered, but not in a shape the schema accepts. */
  | "invalid_output"
  /** The model ran out of output budget mid-answer. */
  | "truncated"
  | "provider_error";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: LlmErrorCode = "provider_error",
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * How much accuracy this call is worth.
 *
 * The app states the stakes; the adapter picks the model and the thinking
 * budget. `precise` is for anything a doctor will read as fact or that lands
 * in a patient record. `fast` is for internal plumbing — parsing a question
 * into a database filter, where a mistake shows up immediately as an obviously
 * wrong search rather than as a quietly wrong clinical note.
 */
export type Tier = "precise" | "fast";

export interface StructuredRequest<T> {
  /**
   * Stable across every call of this kind — keep it byte-identical. Both
   * providers cache on a prefix match, so an interpolated timestamp or UUID in
   * here silently costs you every cache hit.
   */
  system: string;
  /** The per-request half: this transcript, this question, this context. */
  user: string;
  schema: z.ZodType<T>;
  /** Used in provider payloads and in error messages. */
  schemaName: string;
  tier: Tier;
  /**
   * Budget for the answer. On thinking models the reasoning tokens are drawn
   * from the same pool, so this needs headroom well past the size of the JSON.
   */
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /**
   * Prompt tokens served from cache. Watch this: a persistent zero means
   * something varying has crept into the system prompt.
   */
  cacheRead: number;
}

export interface StructuredResult<T> {
  value: T;
  /** The concrete model that answered, for the audit trail. */
  model: string;
  usage?: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/**
 * How long one model call may take. The API routes cap at `maxDuration = 60`,
 * so anything beyond this is time the doctor spends watching a spinner in front
 * of a failure that has already happened.
 */
export const LLM_TIMEOUT_MS = 25_000;
