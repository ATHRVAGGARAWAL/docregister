"use client";

/**
 * Client for our own live-transcription proxy (`server/stt-proxy.ts`).
 *
 * The browser never opens a socket to Sarvam directly. Sarvam authenticates
 * realtime connections with a WebSocket subprotocol (`api-subscription-key.<key>`),
 * which means a browser-side connection would ship the API key to every visitor
 * with devtools. The proxy holds the key; the browser presents its Supabase
 * access token instead, which is already scoped to one doctor and expires.
 *
 * Everything here is best-effort. A failed live socket degrades to "no interim
 * text" — the batch transcript still lands, because that is a separate path.
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

export class LiveTranscriptSocket {
  private socket?: WebSocket;
  private opened = false;
  /** Frames produced before the socket finished opening. */
  private pending: ArrayBuffer[] = [];
  private closedByUs = false;

  constructor(private readonly options: LiveTranscriptOptions) {}

  connect(): void {
    this.options.onEvent({ type: "status", state: "connecting" });

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.options.onEvent({ type: "status", state: "unavailable" });
      return;
    }

    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onopen = () => {
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

    socket.onerror = () => {
      if (!this.closedByUs) {
        this.options.onEvent({ type: "status", state: "unavailable" });
      }
    };

    socket.onclose = () => {
      this.opened = false;
      this.options.onEvent({ type: "status", state: "closed" });
    };
  }

  send(frame: ArrayBuffer): void {
    if (this.opened && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
    } else if (this.pending.length < 200) {
      this.pending.push(frame);
    }
  }

  close(): void {
    this.closedByUs = true;
    this.pending = [];
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "stop" }));
      }
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.socket = undefined;
  }
}
