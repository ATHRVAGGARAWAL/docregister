import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";

import { env } from "@/lib/env";
import {
  LlmError,
  type LlmCallOptions,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResult,
  type Tier,
} from "./types";

/**
 * Claude adapter — kept alongside Gemini rather than deleted.
 *
 * Two providers behind one interface is not hedging. The prompts in
 * `extract.ts` are the part of this app that is expensive to get right, and
 * the only honest way to know whether they are model-specific is to be able to
 * run the same transcript through a second model and diff the output. It also
 * means a provider outage mid-clinic is a config change rather than a deploy.
 *
 * Note for anyone tuning these calls: `temperature`, `top_p` and `top_k` are
 * rejected with a 400 on this model family, as are assistant-turn prefills and
 * `thinking.budget_tokens`. Steering happens through the prompt and through
 * `output_config.format`, not through sampling parameters.
 */
/** Resolved per call for the same reason as the Gemini adapter — see there. */
function modelFor(tier: Tier): string {
  return tier === "precise"
    ? (process.env.ANTHROPIC_MODEL ?? "claude-opus-5")
    : (process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5");
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.anthropicApiKey,
      // The SDK's own retries are off because they are invisible to the policy
      // in `index.ts`: they would spend that call's entire budget inside what
      // looks from above like a single attempt, and they decide on status alone
      // — including the refusals this app must not send a second time.
      //
      // Its 10-minute default timeout is not set here but per request, because
      // the deadline depends on the tier and on how much of the call's budget
      // the previous attempt already spent.
      maxRetries: 0,
    });
  }
  return client;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  async generate<T>(
    request: StructuredRequest<T>,
    options: LlmCallOptions,
  ): Promise<StructuredResult<T>> {
    const model = modelFor(request.tier);

    let message;
    try {
      message = await getClient().messages.parse(
        {
          model,
          max_tokens: request.maxOutputTokens,
          // Adaptive thinking: numeral conversion across three languages and
          // drug disambiguation genuinely benefit from it, and it costs nothing
          // on the easy dictations. `budget_tokens` is a 400 on this family.
          thinking: { type: "adaptive" },
          system: [
            {
              type: "text",
              text: request.system,
              // The cache breakpoint. Everything above it is byte-identical on
              // every request; everything per-encounter is in the user turn.
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: request.user }],
          // `schemaName` is Gemini-side labelling; this SDK derives the name
          // from the Zod schema itself and takes no second argument.
          output_config: { format: zodOutputFormat(request.schema as z.ZodType<T, unknown>) },
        },
        { timeout: options.timeoutMs },
      );
    } catch (error) {
      throw translate(error, model, options.timeoutMs);
    }

    // `parsed_output` is nullable — a refusal or a max-tokens stop leaves it
    // unset, and those are different problems for whoever is on call.
    const value = message.parsed_output;
    if (!value) {
      const code = message.stop_reason === "max_tokens" ? "truncated" : "invalid_output";
      throw new LlmError(
        `${model} produced no ${request.schemaName} (stop_reason: ${message.stop_reason}).`,
        code,
      );
    }

    return {
      value,
      model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

function translate(error: unknown, model: string, timeoutMs: number): LlmError {
  // Ahead of the `APIError` branch it extends, or a stall would be filed as a
  // status-less provider error. Retryable: a connection that goes quiet says
  // nothing about the request, and the next attempt usually lands on a
  // different edge node — the same reasoning the STT layer already applies.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError(
      `${model} did not answer within ${timeoutMs}ms.`,
      "timeout",
      true,
    );
  }

  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) {
      return new LlmError("ANTHROPIC_API_KEY was rejected.", "auth");
    }
    if (status === 429) {
      return new LlmError("Anthropic rate limit reached.", "rate_limited", true);
    }
    return new LlmError(
      `Anthropic returned ${status}: ${error.message.slice(0, 300)}`,
      "provider_error",
      status >= 500,
    );
  }
  return new LlmError(
    error instanceof Error ? error.message : "Anthropic request failed.",
    "provider_error",
    true,
  );
}
