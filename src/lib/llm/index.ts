import "server-only";

import { llmProviderName } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
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

/** The single entry point the prompt modules use. */
export function generateStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  return getLlmProvider().generate(request);
}
