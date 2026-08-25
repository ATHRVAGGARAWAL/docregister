import "server-only";

/**
 * Server-side environment access.
 *
 * Every key here is a secret. None of them may ever be prefixed with
 * `NEXT_PUBLIC_` — in particular the Sarvam key, which their browser
 * WebSocket subprotocol auth (`api-subscription-key.<key>`) would happily
 * accept from the client. We proxy that socket server-side instead precisely
 * so the key never reaches a browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // --- Supabase -----------------------------------------------------------
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  /**
   * Supabase renamed the anon key to the "publishable" key. Both names are in
   * circulation depending on when a project was created, so accept either.
   * This key is safe in the browser — RLS is what protects the data.
   */
  get supabaseAnonKey() {
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the older NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      );
    }
    return key;
  },
  /** Bypasses RLS. Server-only, never in a route that echoes user input. */
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },

  // --- Speech to text -----------------------------------------------------
  get sarvamApiKey() {
    return required("SARVAM_API_KEY");
  },
  get elevenLabsApiKey() {
    return optional("ELEVENLABS_API_KEY");
  },

  // --- LLM ----------------------------------------------------------------
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
} as const;

/**
 * Which STT adapter to use. `mock` lets the whole capture → review → commit
 * pipeline run end to end with no API keys and no network, which is what makes
 * the UI demoable before billing is set up.
 */
export type SttProviderName = "sarvam" | "elevenlabs" | "mock";

export function sttProviderName(): SttProviderName {
  const raw = (process.env.STT_PROVIDER ?? "sarvam").toLowerCase();
  if (raw === "sarvam" || raw === "elevenlabs" || raw === "mock") return raw;
  throw new Error(`Unknown STT_PROVIDER "${raw}"`);
}

/**
 * Which model runs extraction and recall. `mock` is the LLM equivalent of the
 * STT mock above — deterministic offline output so the review-and-commit loop
 * can be demoed and tested with no keys and no network.
 */
export type LlmProviderName = "gemini" | "anthropic" | "mock";

export function llmProviderName(): LlmProviderName {
  // `LLM_MOCK=1` predates `LLM_PROVIDER` and still wins. An existing .env that
  // sets it must not start spending money on a live API just because a
  // provider default appeared underneath it.
  if (process.env.LLM_MOCK === "1") return "mock";
  const raw = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  if (raw === "gemini" || raw === "anthropic" || raw === "mock") return raw;
  throw new Error(`Unknown LLM_PROVIDER "${raw}"`);
}

/** Mock mode for the LLM extraction, for the same reason. */
export function llmMockEnabled(): boolean {
  return llmProviderName() === "mock";
}

/** Public WebSocket URL of the live-transcription proxy. */
export const liveProxyUrl =
  process.env.NEXT_PUBLIC_STT_PROXY_URL ?? "ws://localhost:8787";
