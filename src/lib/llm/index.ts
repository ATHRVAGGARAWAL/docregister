import "server-only";

import { llmProviderName } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { LlmError as LlmErrorClass } from "./types";
import type { LlmProvider, StructuredRequest, StructuredResult } from "./types";

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
 * The single entry point the prompt modules use.
 *
 * Retries once on a retryable failure. Both adapters set `LlmError.retryable`
 * carefully — rate limits and 5xx yes, auth and content-filter refusals no —
 * and until now nothing read it: the flag was a contract with no implementation,
 * and a single transient 503 mid-clinic surfaced to the doctor as a hard
 * failure with a re-dictation as the only recovery.
 *
 * One retry, not a loop. The route's own budget is finite, and a provider that
 * fails twice in a row is not having a blip.
 */
export async function generateStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  try {
    return await getLlmProvider().generate(request);
  } catch (error) {
    if (!(error instanceof LlmErrorClass) || !error.retryable) throw error;

    console.warn(`[llm] retrying after ${error.code}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return getLlmProvider().generate(request);
  }
}

/** Long enough for a rate limit window to move, short enough to stay in budget. */
const RETRY_DELAY_MS = 1_200;
