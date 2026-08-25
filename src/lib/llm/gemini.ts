import "server-only";

import {
  ApiError,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
  type GenerateContentResponse,
  type SafetySetting,
  type ThinkingConfig,
} from "@google/genai";
import * as z from "zod/v4";

import { env } from "@/lib/env";
import { LLM_TIMEOUT_MS } from "./types";
import {
  LlmError,
  type LlmProvider,
  type StructuredRequest,
  type StructuredResult,
  type Tier,
} from "./types";

/**
 * Gemini adapter.
 *
 * ## Model choice
 *
 * Extraction gets the strongest model reachable, and the reasoning is worth
 * spelling out because the cheap option looks so tempting: a clinic does tens
 * of dictations a day, so the difference between tiers is rupees per doctor
 * per day. A drug name mis-read once is a wrong entry in a medical record.
 * There is no volume at which that trade favours the cheaper model.
 *
 * The recall *query parser* is the exception — it turns "what did I give
 * Sunita last time" into `{patient_name, intent, limit}`, and a mistake there
 * surfaces instantly as an obviously wrong search rather than as a quietly
 * wrong clinical note. That one runs a tier down.
 *
 * Both are pinned to explicit versions rather than the floating `-latest`
 * aliases. An alias that silently re-points is fine for a chatbot; here it
 * would change extraction behaviour underneath a clinic with no deploy, no
 * diff, and nothing in the audit trail to explain why last Tuesday's notes
 * parse differently from today's.
 *
 * ## Why Flash and not Pro
 *
 * `gemini-3.1-pro-preview` is the better extraction model and is not used,
 * because a free-tier API key is allotted zero quota for it — every request
 * comes back 429 with `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
 * exhausted. On a billed key, set `GEMINI_MODEL=gemini-3.1-pro-preview` and
 * that is the whole change; the tier split below is what makes it one.
 *
 * `gemini-3.7-flash` is likewise avoided: it answered once and then hung past
 * 90 seconds on repeat calls with this key. An intermittently-hanging model is
 * worse in a clinic than a slightly older reliable one — the doctor has
 * already finished speaking and is waiting on the review sheet.
 */
function modelFor(tier: Tier): string {
  // Read per call, not at module load. Module-level `process.env` capture is a
  // subtle trap: it works in production (Next.js has the environment before it
  // imports anything) and silently ignores the override in any script that
  // sets one after import — which is exactly what a model bench does.
  return tier === "precise"
    ? (process.env.GEMINI_MODEL ?? "gemini-3.6-flash")
    : (process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash");
}

/**
 * Safety filters off, deliberately, and this is not a shortcut.
 *
 * `HARM_CATEGORY_DANGEROUS_CONTENT` is a reasonable default for consumer
 * chat and exactly wrong here: a consultation note is prescription-strength
 * drugs, doses, and self-harm risk assessments, which is the same surface
 * text the filter exists to catch. A filtered response does not degrade
 * gracefully — the doctor finishes speaking, the request fails, and the
 * consultation is not recorded.
 *
 * What makes this safe is the shape of the pipeline rather than the filter:
 * the model never talks to a patient, its output is a fixed JSON schema and
 * not free text, and a clinician reads and confirms every field before it is
 * committed. There is no path from a model token to a person without a doctor
 * in between.
 */
const SAFETY: SafetySetting[] = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.OFF }));

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      // Bounded for the same reason as the Anthropic client: this file's own
      // notes record a model that "hung past 90 seconds" on repeat calls, and
      // the mitigation at the time was to avoid the model. A timeout is the
      // mitigation that generalises.
      httpOptions: { timeout: LLM_TIMEOUT_MS },
    });
  }
  return client;
}

/**
 * The JSON Schema keywords `responseJsonSchema` accepts. Anything else is a
 * 400 on the whole request, so this is a whitelist and not a blacklist —
 * Zod emits `$schema` and `additionalProperties: false` unprompted, and a
 * future Zod version adding one more keyword should degrade to "that
 * constraint isn't enforced by the model" rather than "dictation is down".
 *
 * The constraints that get dropped this way are not load-bearing: nothing in
 * `schema.ts` uses them, precisely because range checks live in
 * `validateExtraction` where they can produce a message for the doctor
 * instead of a parse failure.
 */
const SUPPORTED_KEYWORDS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

/**
 * Objects whose keys are *names the user chose*, not schema keywords. Recursing
 * into these blindly would run the whitelist over field names and delete a
 * property legitimately called `title` or `format`.
 */
const NAME_KEYED = new Set(["properties", "$defs"]);

function prune(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prune);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (NAME_KEYED.has(key) && value !== null && typeof value === "object") {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [
          name,
          prune(sub),
        ]),
      );
    } else {
      out[key] = prune(value);
    }
  }

  // Gemini emits fields in the order the schema lists them, and its own docs
  // note that ordering affects output quality. `schema.ts` is already written
  // in the order a doctor dictates — name, age, diagnosis, treatment, fee — so
  // pinning that order also lets the model fill fields in the order it read
  // them in the transcript, rather than jumping back and forth.
  if (out.properties && typeof out.properties === "object") {
    out.propertyOrdering = Object.keys(out.properties as Record<string, unknown>);
  }
  return out;
}

const schemaCache = new WeakMap<z.ZodType, unknown>();

/** Zod is the source of truth; this is a projection of it Gemini will accept. */
function jsonSchemaFor(schema: z.ZodType): unknown {
  const cached = schemaCache.get(schema);
  if (cached) return cached;
  // `io: "output"` matters — it resolves defaults and transforms to what the
  // model is expected to *produce*, not what our code may pass in.
  const converted = prune(z.toJSONSchema(schema, { io: "output" }));
  schemaCache.set(schema, converted);
  return converted;
}

/**
 * Gemini 3 replaced the numeric `thinkingBudget` with a coarse
 * `thinkingLevel` and rejects the old field; 2.5 is the other way round.
 * Branch on the model family so pinning `GEMINI_MODEL` back to a 2.5 build
 * for a cost comparison does not 400.
 */
function thinkingFor(model: string, tier: Tier): ThinkingConfig {
  if (/^gemini-[3-9]/.test(model)) {
    return { thinkingLevel: tier === "precise" ? ThinkingLevel.HIGH : ThinkingLevel.LOW };
  }
  // -1 is "decide for yourself"; 0 would disable thinking outright.
  return { thinkingBudget: tier === "precise" ? -1 : 0 };
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = modelFor(request.tier);

    let response: GenerateContentResponse;
    try {
      response = await getClient().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        config: {
          // Gemini caches long stable prefixes implicitly on 2.5 and later —
          // no breakpoint to declare, but the same discipline applies: this
          // string must not vary per request or the hit rate goes to zero.
          systemInstruction: request.system,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchemaFor(request.schema),
          thinkingConfig: thinkingFor(model, request.tier),
          safetySettings: SAFETY,
        },
      });
    } catch (error) {
      throw translate(error);
    }

    // A prompt-level block never reaches `candidates` at all, so it has to be
    // checked before anything tries to read the text.
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(`Gemini blocked the prompt (${blockReason}).`, "blocked");
    }

    const finish = response.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") {
      // Thinking tokens come out of the same budget, so this is usually a
      // budget problem rather than a verbose answer. Distinguished from a
      // generic failure because it is the one case where retrying unchanged
      // is pointless.
      throw new LlmError(
        `${model} hit its ${request.maxOutputTokens}-token output budget before finishing the JSON.`,
        "truncated",
      );
    }
    if (finish && finish !== "STOP") {
      throw new LlmError(`${model} stopped early (${finish}).`, "blocked");
    }

    const text = response.text;
    if (!text) throw new LlmError(`${model} returned an empty response.`, "invalid_output");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError(
        `${model} did not return JSON for ${request.schemaName}.`,
        "invalid_output",
      );
    }

    // The schema is enforced twice on purpose. `responseJsonSchema` constrains
    // decoding, but it is the vendor's implementation of a spec, and the
    // whitelist above deliberately drops keywords it cannot express. Zod is
    // what actually guarantees the object the rest of the app receives — the
    // types downstream are inferred from it, so anything that gets past here
    // has already been checked against the real contract.
    const result = request.schema.safeParse(parsed);
    if (!result.success) {
      throw new LlmError(
        `${model} returned a ${request.schemaName} that failed validation: ` +
          z.prettifyError(result.error).slice(0, 300),
        "invalid_output",
      );
    }

    const usage = response.usageMetadata;
    return {
      value: result.data,
      model,
      usage: usage && {
        inputTokens: usage.promptTokenCount ?? 0,
        // Thinking is billed as output but excluded from `candidatesTokenCount`,
        // so leaving it out would under-report the bill by most of it.
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        cacheRead: usage.cachedContentTokenCount ?? 0,
      },
    };
  }
}

function translate(error: unknown): LlmError {
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new LlmError("GEMINI_API_KEY was rejected.", "auth");
    }
    if (status === 429) {
      // Keep Google's own text. A 429 is either "too many requests this minute"
      // or "this key's daily allowance for this model is gone", and those want
      // opposite responses — wait a moment, or move to another model. Only the
      // quota metric in the body tells them apart, and it goes to the server
      // log, not the browser (see `llmResponse` in `lib/api/http.ts`).
      return new LlmError(
        `Gemini rate limit reached: ${error.message.slice(0, 400)}`,
        "rate_limited",
        true,
      );
    }
    return new LlmError(
      `Gemini returned ${status}: ${error.message.slice(0, 300)}`,
      "provider_error",
      status >= 500,
    );
  }
  return new LlmError(
    error instanceof Error ? error.message : "Gemini request failed.",
    "provider_error",
    true,
  );
}
