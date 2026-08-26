import "server-only";

import { llmProviderName } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { LlmError as LlmErrorClass } from "./types";
import type {
  LlmErrorCode,
  LlmProvider,
  StructuredRequest,
  StructuredResult,
  Tier,
} from "./types";

export { LlmError } from "./types";
export type { StructuredRequest, StructuredResult, Tier } from "./types";

const providers: Partial<Record<string, LlmProvider>> = {};

/**
 * Resolved per call rather than at module load. Next.js keeps route modules
 * warm across requests, so caching the choice would mean a provider switch
 * needed a restart — and, more to the point, constructing the client eagerly
 * would make a missing `ANTHROPIC_API_KEY` throw on a Gemini deployment that
 * has no business needing one.
 */
export function getLlmProvider(): LlmProvider {
  const name = llmProviderName();
  if (name === "mock") {
    throw new Error(
      "getLlmProvider() called in mock mode — the mock paths in extract.ts / " +
        "recall.ts should have returned before reaching a provider.",
    );
  }
  const existing = providers[name];
  if (existing) return existing;

  const created: LlmProvider =
    name === "gemini" ? new GeminiProvider() : new AnthropicProvider();
  providers[name] = created;
  return created;
}

/**
 * The wall-clock budget for one call, by tier. `attempt` bounds a single
 * request to the provider; `total` bounds the whole call including retries and
 * the waiting in between.
 *
 * Derived from the routes rather than picked for feel. Every route that reaches
 * a model declares `maxDuration = 60` — `encounters/extract`, `recall`,
 * `drafts/[id]/retry` — and a client deadline past the serverless limit is not
 * a deadline at all: the platform kills the function first, so the extra wait
 * buys the doctor nothing but more spinner in front of the same failure.
 *
 * Both tiers have to fit inside one route, because both routes use both.
 * `extract` classifies the utterance (fast) and then extracts (precise);
 * `recall` parses the question (fast), runs SQL, then summarises (precise).
 * 13 + 36 = 49s, which leaves ~11s for the Supabase round trips either side.
 *
 * `drafts/[id]/retry` is tighter than either, and this file cannot make it fit
 * on its own: it transcribes first — two legs of `STT_TIMEOUT_MS` when the
 * primary stalls and the failover runs — and only then extracts. Two stalls in
 * one request overrun the minute however the model's share is divided, because
 * the share left over is too small for a `precise` extraction to be worth
 * attempting at all. The platform's kill is the backstop for that case. What
 * these numbers buy is the ordinary one: a 429, a 503 or a single stalled leg
 * now gives up early enough to leave the rest of the route its time.
 *
 * The gap between the tiers is the reason tiers exist here. `fast` turns a
 * spoken question into a database filter while the doctor waits on a *search*:
 * six seconds of that already reads as broken, and giving up is cheap —
 * `classifyUtterance` falls back to `dictation` and the utterance lands on the
 * review sheet where a human decides. `precise` lands in a patient record, and
 * by then the doctor has finished speaking; twenty-odd seconds is a far better
 * trade than a consultation they have to type out themselves.
 */
const BUDGET_MS: Record<Tier, { attempt: number; total: number }> = {
  fast: { attempt: 6_000, total: 13_000 },
  precise: { attempt: 22_000, total: 36_000 },
};

/**
 * Attempts, not retries: 3 means the original call and two more.
 *
 * The budget usually stops the loop first. This cap is for the failure that
 * comes back instantly — a provider answering 429 in 50ms would otherwise let
 * the loop spin through the whole budget hammering it.
 */
const MAX_ATTEMPTS = 3;

/** Doubles per attempt: 700ms, then 1.4s. */
const BACKOFF_MS = 700;

/**
 * Never start an attempt that cannot finish. Under this much budget the model
 * has no realistic chance of answering before the deadline cuts it off, so the
 * request would be billed and thrown away while the doctor waits for a failure
 * that is already certain.
 */
const MIN_ATTEMPT_MS = 2_000;

/**
 * Never retried, whatever `retryable` says.
 *
 * A content filter refusing clinical text is not a blip. The same transcript,
 * the same model and the same policy produce the same refusal, so a second call
 * is a guaranteed failure bought with the seconds the doctor has left — and it
 * delays the only thing that actually clears it, which is the message telling
 * them to re-dictate. A rejected API key is the same shape of mistake: a
 * deployment problem that retrying turns into a slower deployment problem.
 *
 * Both adapters already set `retryable: false` on these two. This set is the
 * belt: an adapter that gets the flag wrong should cost the app some latency,
 * not quietly hammer a provider's abuse controls with refused requests.
 */
const NEVER_RETRY: ReadonlySet<LlmErrorCode> = new Set(["blocked", "auth"]);

/**
 * The single entry point the prompt modules use.
 *
 * Bounded in two directions, and the two bounds answer different failures.
 *
 * A per-attempt deadline is for a provider that accepts the connection and then
 * stalls: without it the request holds the route open until the platform kills
 * it, the doctor watches the review sheet spin for a minute, and it fails
 * anyway. A total budget is what keeps the retries themselves from becoming
 * that same stall — the sum has to fit inside the route's `maxDuration` or the
 * retry is just a slower way to lose the consultation.
 *
 * Retries are gated on `LlmError.retryable` rather than on the status code,
 * because that flag is where each adapter has already decided which of its
 * vendor's failures a second identical call could plausibly change.
 *
 * Mock mode never reaches here: `extract.ts`, `recall.ts` and `intent.ts`
 * return their offline answers before calling this, so `LLM_MOCK=1` keeps its
 * zero-network, zero-latency behaviour and gains no retry.
 */
export async function generateStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  // Resolved once. A provider that cannot be constructed — or mock mode
  // leaking this far — is a configuration error, and re-resolving it per
  // attempt would only produce the same throw a second time.
  const provider = getLlmProvider();
  const budget = BUDGET_MS[request.tier];
  const deadline = Date.now() + budget.total;

  for (let attempt = 1; ; attempt++) {
    try {
      return await provider.generate(request, {
        // A later attempt gets what is left rather than a fresh full slice:
        // its predecessors have already spent part of the budget, and `total`
        // is the promise about how long the doctor waits.
        timeoutMs: Math.min(budget.attempt, deadline - Date.now()),
      });
    } catch (error) {
      if (!(error instanceof LlmErrorClass)) throw error;

      const backoff = BACKOFF_MS * 2 ** (attempt - 1);
      if (
        attempt >= MAX_ATTEMPTS ||
        !error.retryable ||
        NEVER_RETRY.has(error.code) ||
        deadline - Date.now() - backoff < MIN_ATTEMPT_MS
      ) {
        throw error;
      }

      console.warn(
        `[llm] ${request.schemaName} ${error.code} on attempt ${attempt}, retrying in ${backoff}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
