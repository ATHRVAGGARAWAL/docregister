import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "@/lib/env";
import {
  LlmError,
  type LlmCallOptions,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

let client: OpenAI | undefined;

function getClient(): OpenAI {
  return client ??= new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    // The shared retry policy owns deadlines and retries across providers.
    maxRetries: 0,
  });
}

/** Responses API adapter, including Azure's OpenAI-compatible v1 endpoint. */
export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";

  async generate<T>(
    request: StructuredRequest<T>,
    options: LlmCallOptions,
  ): Promise<StructuredResult<T>> {
    const model = request.tier === "fast"
      ? (process.env.OPENAI_FAST_MODEL ?? "gpt-6-astra")
      : (process.env.OPENAI_MODEL ?? "gpt-6-astra");

    try {
      const response = await getClient().responses.create({
        model,
        instructions: request.system,
        input: request.user,
        reasoning: { effort: request.tier === "fast" ? "low" : "medium" },
        text: { format: zodTextFormat(request.schema, request.schemaName) },
        max_output_tokens: request.maxOutputTokens,
        store: false,
      }, { timeout: options.timeoutMs });

      if (response.output.some(item => item.type === "message" &&
        item.content.some(part => part.type === "refusal")) ||
        response.incomplete_details?.reason === "content_filter") {
        throw new LlmError("OpenAI declined this request.", "blocked");
      }
      if (response.status === "incomplete") {
        throw new LlmError("OpenAI did not complete the structured response.", "truncated");
      }
      if (response.status !== "completed") {
        throw new LlmError("OpenAI could not complete the request.", "provider_error", true);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.output_text);
      } catch {
        throw new LlmError("OpenAI returned invalid JSON.", "invalid_output");
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) {
        throw new LlmError("OpenAI returned an invalid structured response.", "invalid_output");
      }
      return {
        value: result.data,
        model: response.model,
        usage: response.usage ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheRead: response.usage.input_tokens_details?.cached_tokens ?? 0,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new LlmError("OpenAI did not answer within the request deadline.", "timeout", true);
      }
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401 || error.status === 403) {
          throw new LlmError("OpenAI credentials were rejected.", "auth");
        }
        if (error.status === 429) {
          throw new LlmError("OpenAI rate limit reached.", "rate_limited", true);
        }
        if (error.code === "content_filter") {
          throw new LlmError("OpenAI declined this request.", "blocked");
        }
        // Provider errors may contain transcript text; never relay their body.
        throw new LlmError("OpenAI request failed.", "provider_error", (error.status ?? 0) >= 500);
      }
      throw new LlmError("OpenAI request failed.", "provider_error",
        error instanceof OpenAI.APIConnectionError);
    }
  }
}
