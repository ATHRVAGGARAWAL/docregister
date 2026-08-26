/**
 * Live transcription proxy.
 *
 * Why this process exists at all: connecting from the browser would require a
 * temporary vendor token or expose a billable ElevenLabs key. The browser
 * talks to this authenticated proxy instead, and only the proxy holds that
 * key.
 *
 * The browser presents its Supabase access token instead. That token is
 * already scoped to one doctor, expires on its own, and is revocable.
 *
 *   browser --(ws, supabase JWT + Int16 PCM @16k)--> proxy --> ElevenLabs
 *
 * Run with `npm run dev` (started alongside Next by concurrently) or
 * `npm run dev:proxy` on its own.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import {
  elevenLabsAudioMessage,
  elevenLabsRealtimeUrl,
  parseElevenLabsEvent,
} from "./elevenlabs-realtime.ts";

loadEnvLocal();

const PORT = Number(process.env.PORT ?? process.env.STT_PROXY_PORT ?? 8787);
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Without a key we still run, and stream a canned transcript instead. */
const MOCK = !ELEVENLABS_KEY || process.env.STT_PROVIDER === "mock";

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
  let upstreamReady = false;
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
    upstreamReady = false;
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
        if (upstreamReady && upstream?.readyState === WebSocket.OPEN) {
          // ElevenLabs documents an empty audio chunk with `commit: true` as
          // the manual end-of-segment signal. VAD normally committed the last
          // phrase already; this catches speech right against the stop press.
          upstream.send(elevenLabsAudioMessage(Buffer.alloc(0), { commit: true }));
        }
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

      upstream = openElevenLabs(client, () => {
        upstreamReady = true;
        for (const frame of queue) {
          if (upstream?.readyState === WebSocket.OPEN) {
            upstream.send(elevenLabsAudioMessage(frame));
          }
        }
        queue = [];
      }, () => {
        upstreamReady = false;
      });
      return;
    }

    // ---- Audio frames ----------------------------------------------------
    if (!authorised) return;

    const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (upstreamReady && upstream?.readyState === WebSocket.OPEN) {
      upstream.send(elevenLabsAudioMessage(frame));
    } else if (!MOCK && queue.length < 100) {
      queue.push(frame);
    }
  });

  client.on("close", shutdown);
  client.on("error", shutdown);
});

/**
 * Open the upstream ElevenLabs Scribe v2 Realtime socket. Audio is not flushed
 * until `session_started`; an open WebSocket is only the transport handshake,
 * not confirmation that the transcription session accepted its configuration.
 */
function openElevenLabs(
  client: WebSocket,
  onReady: () => void,
  onClosed: () => void,
): WebSocket {
  const upstream = new WebSocket(elevenLabsRealtimeUrl(), {
    headers: { "xi-api-key": ELEVENLABS_KEY },
  });

  let ready = false;

  upstream.on("message", (raw: RawData) => {
    const event = parseElevenLabsEvent(raw.toString());
    if (!event) return;

    if (event.type === "ready") {
      if (!ready) {
        ready = true;
        onReady();
      }
      return;
    }

    if (event.type === "error") {
      console.error("[stt-proxy] ElevenLabs rejected stream", event.code);
      send(client, { type: "status", state: "unavailable" });
      if (client.readyState === WebSocket.OPEN) {
        client.close(1011, "transcription upstream rejected stream");
      }
      upstream.close();
      return;
    }

    send(client, event);
  });

  upstream.on("error", (error) => {
    console.error("[stt-proxy] ElevenLabs websocket error", error.message);
    send(client, { type: "status", state: "unavailable" });
    if (client.readyState === WebSocket.OPEN) {
      // 1012 is retryable in the browser client. Live text is cosmetic and the
      // separate MediaRecorder/batch path remains the transcript of record.
      client.close(1012, "transcription upstream unavailable");
    }
  });

  upstream.on("close", () => {
    onClosed();
    send(client, { type: "status", state: "closed" });
    if (client.readyState === WebSocket.OPEN) {
      client.close(1012, "transcription upstream closed");
    }
  });

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
    (MOCK
      ? "  (mock mode — no ELEVENLABS_API_KEY set or STT_PROVIDER=mock)"
      : "  (elevenlabs realtime)"),
);
