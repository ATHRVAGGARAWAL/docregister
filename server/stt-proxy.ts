/**
 * Live transcription proxy.
 *
 * Why this process exists at all: Sarvam authenticates realtime WebSocket
 * connections with a subprotocol that carries the raw API key
 * (`api-subscription-key.<key>`). A browser can technically do that — their
 * docs even show it — and it would put a billable, unscoped production key in
 * every visitor's devtools. So the browser talks to us, we talk to Sarvam.
 *
 * The browser presents its Supabase access token instead. That token is
 * already scoped to one doctor, expires on its own, and is revocable.
 *
 *   browser --(ws, supabase JWT + Int16 PCM @16k)--> proxy --(ws, api key)--> Sarvam
 *
 * Run with `npm run dev` (started alongside Next by concurrently) or
 * `npm run dev:proxy` on its own.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { WebSocket, WebSocketServer, type RawData } from "ws";

loadEnvLocal();

const PORT = Number(process.env.STT_PROXY_PORT ?? 8787);
const SARVAM_KEY = process.env.SARVAM_API_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Without a key we still run, and stream a canned transcript instead. */
const MOCK = !SARVAM_KEY || process.env.STT_PROVIDER === "mock";

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

interface StartMessage {
  type: "start";
  token: string;
  languages?: string[];
  sampleRate?: number;
}

const server = new WebSocketServer({
  port: PORT,
  // `ws` defaults to a 100 MB frame. Nothing here is remotely that big: the
  // worklet emits Int16 PCM in small chunks, so anything larger is either a bug
  // or someone using an authenticated socket as free memory.
  maxPayload: 1 << 20,
});

// Without this an EADDRINUSE — or any socket-level error — is an unhandled
// 'error' event, which takes the whole process down and with it every doctor's
// live transcript, not just the one that failed.
server.on("error", (error) => {
  console.error("[stt-proxy] server error", error);
});

server.on("connection", (client) => {
  let upstream: WebSocket | null = null;
  let authorised = false;
  let mockTimer: ReturnType<typeof setInterval> | null = null;
  // Frames that arrived while the upstream handshake was still in flight.
  let queue: Buffer[] = [];

  const shutdown = () => {
    if (mockTimer) clearInterval(mockTimer);
    mockTimer = null;
    queue = [];
    try {
      upstream?.close();
    } catch {
      /* already closed */
    }
    upstream = null;
  };

  client.on("message", async (data: RawData, isBinary: boolean) => {
    // ---- Control frames --------------------------------------------------
    if (!isBinary) {
      let message: StartMessage | { type: string };
      try {
        message = JSON.parse(data.toString()) as StartMessage;
      } catch {
        return;
      }

      if (message.type === "stop") {
        shutdown();
        client.close(1000, "stopped");
        return;
      }

      if (message.type !== "start" || authorised) return;

      const start = message as StartMessage;

      // Verify before dialling upstream. Anything else means an unauthenticated
      // socket can spend the clinic's STT budget.
      if (!supabase) {
        client.close(1011, "proxy not configured");
        return;
      }
      const { data: auth, error } = await supabase.auth.getUser(start.token);
      if (error || !auth.user) {
        client.close(4401, "unauthorised");
        return;
      }

      // Authentication was never the whole job. `0004_audit_and_limits.sql`
      // sets a 40/hour ceiling on transcription, and it only ever covered the
      // HTTP path — this socket streams to the same paid vendor and spent from
      // the same budget without ever asking. Metered as the user, so the
      // policy applies per doctor exactly as it does over HTTP.
      const scoped = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${start.token}` } },
      });
      const { data: allowed, error: limitError } = await scoped.rpc(
        "consume_rate_limit",
        { p_action: "transcribe" },
      );
      // Fail closed on an error, but not on a missing function: a deployment
      // that has not run 0004 should still be able to dictate.
      if (limitError && limitError.code !== "42883" && limitError.code !== "PGRST202") {
        console.error("[stt-proxy] rate limit check failed", limitError.code);
        client.close(1011, "rate limit unavailable");
        return;
      }
      if (allowed === false) {
        client.close(4429, "rate limited");
        return;
      }

      authorised = true;

      if (MOCK) {
        mockTimer = startMockStream(client);
        return;
      }

      upstream = openSarvam(start.languages ?? ["hi-IN"], client, () => {
        for (const frame of queue) upstream?.send(frame);
        queue = [];
      });
      return;
    }

    // ---- Audio frames ----------------------------------------------------
    if (!authorised) return;

    const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(frame);
    } else if (!MOCK && queue.length < 100) {
      queue.push(frame);
    }
  });

  client.on("close", shutdown);
  client.on("error", shutdown);
});

/**
 * Open the upstream Sarvam socket.
 *
 * Note: the exact query parameters here are the one thing in this file that
 * cannot be verified without a live key. If interim results never arrive,
 * check the current realtime docs at docs.sarvam.ai before assuming the audio
 * pipeline is at fault — the batch path in `src/lib/stt/sarvam.ts` is
 * independent and will still be working.
 */
function openSarvam(
  languages: string[],
  client: WebSocket,
  onOpen: () => void,
): WebSocket {
  const url = new URL("wss://api.sarvam.ai/speech-to-text/ws");
  url.searchParams.set("model", "saarika:v2.5");
  url.searchParams.set("language-code", languages[0] ?? "unknown");
  url.searchParams.set("input-audio-codec", "pcm_s16le");
  url.searchParams.set("input-audio-sample-rate", "16000");

  const upstream = new WebSocket(url.toString(), [
    `api-subscription-key.${SARVAM_KEY}`,
  ]);

  upstream.on("open", onOpen);

  upstream.on("message", (raw: RawData) => {
    try {
      const event = JSON.parse(raw.toString()) as {
        type?: string;
        data?: { transcript?: string; is_final?: boolean };
        transcript?: string;
      };

      const text = event.data?.transcript ?? event.transcript;
      if (!text) return;

      const isFinal = event.data?.is_final ?? event.type?.includes("final") ?? false;
      send(client, { type: isFinal ? "final" : "interim", text });
    } catch {
      /* non-JSON keepalive */
    }
  });

  upstream.on("error", () => {
    // Deliberately quiet toward the client: losing live text is cosmetic,
    // because the recording is still being captured for the batch pass.
    send(client, { type: "status", state: "unavailable" });
  });

  upstream.on("close", () => send(client, { type: "status", state: "closed" }));

  return upstream;
}

/** Canned interim stream so the live UI is demoable with no API keys. */
function startMockStream(client: WebSocket) {
  const words =
    "Patient Sunita Devi, umar bayalis saal, complaint hai bukhar aur khaansi teen din se. Diagnosis viral fever. Dolo 650 BD paanch din, fees paanch sau.".split(
      " ",
    );
  let index = 0;

  return setInterval(() => {
    if (client.readyState !== WebSocket.OPEN) return;
    index = Math.min(index + 2, words.length);
    send(client, { type: "interim", text: words.slice(0, index).join(" ") });
    if (index >= words.length) {
      send(client, { type: "final", text: words.join(" ") });
      index = 0;
    }
  }, 420);
}

function send(client: WebSocket, payload: Record<string, unknown>) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
}

/**
 * Minimal .env.local reader. Next loads these itself, but this process runs
 * outside Next and pulling in dotenv for six lines is not worth a dependency.
 */
function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    try {
      const contents = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of contents.split("\n")) {
        const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
        if (!match) continue;
        const [, key, rawValue = ""] = match;
        if (process.env[key] !== undefined) continue;
        process.env[key] = rawValue.replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* file is optional */
    }
  }
}

console.log(
  `[stt-proxy] listening on ws://localhost:${PORT}` +
    (MOCK ? "  (mock mode — no SARVAM_API_KEY set)" : "  (sarvam realtime)"),
);
