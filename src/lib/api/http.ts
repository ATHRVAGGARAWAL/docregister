import "server-only";

import { NextResponse } from "next/server";

import { LlmError } from "@/lib/llm/types";
import { getCurrentDoctor, getSupabaseServerClient, type CurrentDoctor } from "@/lib/supabase/server";

/**
 * Shared route plumbing.
 *
 * Three rules are enforced here rather than in each route, because "every route
 * remembered to do it" is not a security model:
 *
 *  1. Every request resolves to a doctor row before anything else runs. The
 *     doctor's `clinic_id` is read from the database, never from the request
 *     body — otherwise a caller could set their own tenant.
 *  2. Errors are never echoed raw. A Postgres or provider error can contain
 *     row contents, which for this app means patient data in a log or a
 *     browser console.
 *  3. Routes that cost money or enumerate data declare a rate-limit action and
 *     spend a token before the handler runs.
 */

export type ApiHandler<T> = (context: {
  doctor: CurrentDoctor;
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  request: Request;
  params: T;
}) => Promise<NextResponse>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * A key in `rate_limit_policies`. The ceiling itself lives in the database, so
 * a route only names the bucket it spends from.
 */
export type RateLimitAction = "transcribe" | "extract" | "recall" | "commit" | "match";

export interface RouteOptions {
  rateLimit?: RateLimitAction;
}

/**
 * Wrap a route handler with authentication, rate limiting and error
 * normalisation.
 *
 * `params` is a promise in Next 16 — synchronous access was removed, not just
 * deprecated — so it is awaited here once and handed to the handler resolved.
 */
export function withDoctor<T = Record<string, never>>(
  handler: ApiHandler<T>,
  options: RouteOptions = {},
) {
  return async (request: Request, context: { params?: Promise<T> } = {}) => {
    let doctor: CurrentDoctor | null;
    let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;

    try {
      supabase = await getSupabaseServerClient();
      doctor = await getCurrentDoctor();
    } catch {
      return jsonError("Could not verify your session.", 401);
    }

    if (!doctor) return jsonError("Sign in to continue.", 401);

    if (options.rateLimit) {
      const denial = await spendRateLimit(supabase, options.rateLimit);
      if (denial) return denial;
    }

    try {
      const params = ((await context.params) ?? {}) as T;
      return await handler({ doctor, supabase, request, params });
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.message, error.status);
      }

      const path = new URL(request.url).pathname;

      // An LLM failure is not a bug in this app, and telling the doctor "something
      // went wrong on our end" when the real answer is "the model's rate limit is
      // full, wait a minute" costs them a retry they cannot reason about. Mapped
      // centrally so every route that reaches a model reports the same way — the
      // provider's own text still never leaves the server.
      if (error instanceof LlmError) {
        console.error("[api]", request.method, path, error.code, error.message);
        return jsonError(...llmResponse(error));
      }

      // Log the detail server-side; return something safe to the browser.
      console.error("[api]", request.method, path, error);
      return jsonError("Something went wrong on our end. Please try again.", 500);
    }
  };
}

/**
 * Spend one token, or produce the 429 that stops the request.
 *
 * The bucket is keyed on `auth.uid()` inside the database function, so nothing
 * here is caller-controlled beyond the action name.
 *
 * On a Postgres error this fails **closed** — an abuse control that switches
 * itself off when the database is unhappy is not a control. The single
 * exception is "the function does not exist", which means the deployment is
 * running ahead of migration 0004; that is an operator problem, and bricking
 * every route over it would turn a missing migration into an outage.
 */
async function spendRateLimit(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  action: RateLimitAction,
): Promise<NextResponse | null> {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_action: action });

  if (error) {
    const missing = error.code === "42883" || error.code === "PGRST202";
    if (missing) {
      console.error(
        `[rate-limit] consume_rate_limit is missing — apply supabase/migrations/0004_audit_and_limits.sql. Allowing "${action}" through.`,
      );
      return null;
    }
    console.error("[rate-limit]", action, error.code, error.message);
    return jsonError("Could not verify your session.", 503);
  }

  if (data === false) {
    const response = jsonError(
      "You have hit this hour's limit for that action. It resets shortly.",
      429,
    );
    // Windows are hourly, so the honest worst case is the full hour.
    response.headers.set("Retry-After", "3600");
    return response;
  }

  return null;
}

function llmResponse(error: LlmError): [message: string, status: number] {
  switch (error.code) {
    case "rate_limited":
      // The single most likely failure on a free-tier key, and the only one the
      // doctor can actually act on.
      return ["The assistant is busy right now. Try again in a moment.", 429];
    case "auth":
      return ["The assistant is not configured. Check the server API key.", 502];
    case "blocked":
      // Safety filters on clinical text. Nothing the doctor did wrong, and
      // re-dictating usually clears it.
      return ["The assistant would not process that dictation. Try again.", 422];
    case "truncated":
      return ["That dictation was too long for the assistant to finish.", 422];
    default:
      return ["The assistant could not read that dictation. Try again.", 502];
  }
}

/**
 * Parse a JSON body.
 *
 * The type parameter is the caller's *expectation*, not a guarantee — nothing
 * here validates the payload. Every field is re-checked at its point of use
 * (`requireString`, `coerceAge`, `coerceFees`), and the database's own checks
 * are the backstop.
 */
export async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("Expected a JSON body.");
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(`\`${field}\` is required.`);
  }
  return value.trim();
}
