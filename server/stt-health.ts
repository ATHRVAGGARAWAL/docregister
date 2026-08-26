export interface SttHealthConfig {
  supabaseUrl: string;
  supabaseKey: string;
  elevenLabsKey: string;
  provider?: string;
  allowMock?: boolean;
}

export interface SttHealthResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Resolve an HTTP request to the STT process's public readiness endpoint.
 *
 * This is kept pure so the routing and readiness rules can be unit-tested
 * without starting a listening socket. Returning null means the request is not
 * for the health endpoint and should receive the server's normal 404 response.
 */
export function sttHealthResponse({
  method,
  requestUrl,
  config,
  now = new Date(),
}: {
  method?: string;
  requestUrl?: string;
  config: SttHealthConfig;
  now?: Date;
}): SttHealthResponse | null {
  const pathname = new URL(requestUrl ?? "/", "http://localhost").pathname;
  if (pathname !== "/healthz") return null;

  const requestMethod = (method ?? "GET").toUpperCase();
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };

  if (requestMethod !== "GET" && requestMethod !== "HEAD") {
    return {
      statusCode: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
      body: JSON.stringify({ status: "method_not_allowed" }),
    };
  }

  const provider = (config.provider ?? "elevenlabs").toLowerCase();
  const transcriptionConfigured =
    (provider === "mock" && config.allowMock === true) ||
    (provider === "elevenlabs" && Boolean(config.elevenLabsKey));
  const configured = Boolean(
    config.supabaseUrl && config.supabaseKey && transcriptionConfigured,
  );
  const body = JSON.stringify({
    status: configured ? "ok" : "unavailable",
    configured,
    checkedAt: now.toISOString(),
  });

  return {
    statusCode: configured ? 200 : 503,
    headers,
    body: requestMethod === "HEAD" ? "" : body,
  };
}
