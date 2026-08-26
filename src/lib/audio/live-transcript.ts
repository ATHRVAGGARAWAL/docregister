"use client";

/**
 * Client for our own live-transcription proxy (`server/stt-proxy.ts`).
 *
 * The browser never opens a socket to ElevenLabs with a long-lived API key.
 * The proxy holds that key; the browser presents its Supabase access token
 * instead, which is already scoped to one doctor and expires.
 *
 * Everything here is best-effort. A failed live socket degrades to "no interim
 * text" — the batch transcript still lands, because that is a separate path.
 * The one obligation this class does have is to say so: silence and a working
 * socket look identical from the outside, so every way this can end reaches the
 * caller as a `status` event.
 */

export type LiveTranscriptEvent =
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "status"; state: "connecting" | "open" | "closed" | "unavailable" };

export interface LiveTranscriptOptions {
  url: string;
  /** Supabase access token — the proxy verifies it before dialling upstream. */
  token: string;
  /** BCP-47 hints, e.g. ["hi-IN", "en-IN"]. */
  languages: string[];
  onEvent: (event: LiveTranscriptEvent) => void;
}

/**
 * Dials spent per session, first attempt included.
 *
 * The budget is session-wide rather than reset on each successful open. A
 * capture is capped at about 29 seconds by the caller, so a handful of dials is
 * all that can usefully fit inside one anyway — and every dial that gets as far
 * as the proxy's `start` message spends one unit of the doctor's 40-per-hour
 * transcription ceiling (`consume_rate_limit`, see `server/stt-proxy.ts`).
 * Resetting the count on each open would let a proxy that accepts and
 * immediately drops redial all consultation and exhaust that ceiling, which
 * would then refuse a later patient's dictation on the batch path too — the one
 * path that actually matters.
 */
const MAX_DIALS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 4_000;

/**
 * How long to wait for the handshake before treating the dial as failed.
 *
 * A proxy that accepts the TCP connection but never upgrades leaves `onopen`,
 * `onclose` and `onerror` all unfired, so without a deadline the socket sits in
 * CONNECTING for the entire consultation while frames pile into `pending` and
 * the cap silently drops the oldest. Six seconds is long enough for a slow
 * mobile handshake and short enough to still leave time to say so.
 */
const OPEN_TIMEOUT_MS = 6_000;

/**
 * Close codes where redialling cannot produce a different answer.
 *
 *   1000 normal        — the far end is finished; ours only closes cleanly on
 *                        the `stop` we sent it.
 *   1008 policy        — the connection was refused on its merits.
 *   1011 server error  — the proxy sends this for "not configured" and for a
 *                        failed rate-limit check; neither resolves itself
 *                        inside the half-minute this capture lasts.
 *   4401 unauthorised  — the access token will not become valid by asking again.
 *   4429 rate limited  — a redial spends another rate-limit check to be told
 *                        the same thing, against the ceiling that just refused us.
 *
 * Anything else — 1006 abnormal, 1001 going away, a restarting proxy — is the
 * dropped-frame case this class is meant to survive, so it is retried.
 */
const TERMINAL_CLOSE_CODES = new Set([1000, 1008, 1011, 4401, 4429]);

export class LiveTranscriptSocket {
  private socket?: WebSocket;
  private opened = false;
  /** Frames produced before the socket finished opening. */
  private pending: ArrayBuffer[] = [];
  private closedByUs = false;
  /** Set once no further dial will be made, so `pending` stops growing. */
  private abandoned = false;
  private dials = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private openTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: LiveTranscriptOptions) {}

  connect(): void {
    this.closedByUs = false;
    this.abandoned = false;
    this.dials = 0;
    this.dial();
  }

  private dial(): void {
    this.dials += 1;
    this.options.onEvent({ type: "status", state: "connecting" });

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      // A malformed URL, or a ws:// upgrade blocked on an https page, throws
      // synchronously and would throw identically on every retry. Backing off
      // and trying again would only delay telling the doctor.
      this.giveUp();
      return;
    }

    socket.binaryType = "arraybuffer";
    this.socket = socket;

    this.openTimer = setTimeout(() => {
      this.openTimer = undefined;
      if (this.socket !== socket || this.opened) return;
      // Drop our claim on this socket first: closing it fires `onclose`, and
      // that handler must not also count the dial we are already counting here.
      this.socket = undefined;
      try {
        socket.close();
      } catch {
        /* already going */
      }
      this.scheduleRetry();
    }, OPEN_TIMEOUT_MS);

    socket.onopen = () => {
      this.clearOpenTimer();
      socket.send(
        JSON.stringify({
          type: "start",
          token: this.options.token,
          languages: this.options.languages,
          sampleRate: 16000,
        }),
      );
      this.opened = true;
      this.options.onEvent({ type: "status", state: "open" });

      // Cap the replay: if the socket took several seconds to open we would
      // rather drop the backlog than push stale audio ahead of live audio.
      for (const frame of this.pending.slice(-40)) socket.send(frame);
      this.pending = [];
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          text?: string;
        };
        if (message.type === "interim" && message.text) {
          this.options.onEvent({ type: "interim", text: message.text });
        } else if (message.type === "final" && message.text) {
          this.options.onEvent({ type: "final", text: message.text });
        }
      } catch {
        /* non-JSON frame from the proxy — ignore */
      }
    };

    // `onerror` is deliberately not handled. The spec fires `close` after every
    // `error`, and only the close carries the code that decides whether a
    // redial is worth anything, so acting on `error` as well would either
    // double-count the dial or retry a refusal that told us not to.
    socket.onclose = (event) => {
      // Superseded by a later dial, or closed by us — either way this socket is
      // no longer the one whose fate the caller is waiting on. `close()`
      // announces its own ending, because it has to work even when the retry
      // timer is armed and there is no socket left to report anything.
      if (this.socket !== socket) return;
      this.clearOpenTimer();
      this.opened = false;
      this.socket = undefined;

      if (TERMINAL_CLOSE_CODES.has(event.code)) {
        this.giveUp();
        return;
      }

      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.closedByUs) return;
    if (this.dials >= MAX_DIALS) {
      this.giveUp();
      return;
    }

    // 500ms, then 1s, then 2s: the whole budget is spent inside about four
    // seconds, which is the useful window. A backoff measured in tens of
    // seconds would outlast the recording it is meant to be transcribing.
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.dials - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.closedByUs) return;
      this.dial();
    }, delay);
  }

  private giveUp(): void {
    this.abandoned = true;
    // Nothing will ever drain the queue now, and the recorder keeps producing
    // frames until the doctor stops speaking, so holding them is memory spent
    // on audio no one will transcribe.
    this.pending = [];
    this.options.onEvent({ type: "status", state: "unavailable" });
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = undefined;
  }

  send(frame: ArrayBuffer): void {
    if (this.opened && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
    } else if (!this.abandoned && this.pending.length < 200) {
      this.pending.push(frame);
    }
  }

  close(): void {
    if (this.closedByUs) return; // idempotent: one ending, announced once
    this.closedByUs = true;
    this.pending = [];
    // A retry armed a moment before the doctor pressed stop would otherwise
    // open a fresh socket after the capture has finished.
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.clearOpenTimer();
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "stop" }));
      }
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.socket = undefined;
    this.options.onEvent({ type: "status", state: "closed" });
  }
}
