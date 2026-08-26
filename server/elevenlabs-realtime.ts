const ELEVENLABS_REALTIME_ENDPOINT =
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export const ELEVENLABS_REALTIME_MODEL = "scribe_v2_realtime";
export const ELEVENLABS_SAMPLE_RATE = 16_000;

/**
 * The browser worklet already produces mono Int16 PCM at 16 kHz. VAD commits
 * stable phrases while the doctor speaks, which means the UI receives final
 * segments even if the browser closes its best-effort live socket immediately
 * after sending the final `stop` control message.
 */
export function elevenLabsRealtimeUrl(): string {
  const url = new URL(ELEVENLABS_REALTIME_ENDPOINT);
  url.searchParams.set("model_id", ELEVENLABS_REALTIME_MODEL);
  url.searchParams.set("audio_format", "pcm_16000");
  url.searchParams.set("commit_strategy", "vad");
  return url.toString();
}

/** Convert a raw PCM frame into ElevenLabs' realtime WebSocket wire format. */
export function elevenLabsAudioMessage(
  audio: Uint8Array,
  { commit = false }: { commit?: boolean } = {},
): string {
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: Buffer.from(
      audio.buffer,
      audio.byteOffset,
      audio.byteLength,
    ).toString("base64"),
    commit,
    sample_rate: ELEVENLABS_SAMPLE_RATE,
  });
}

export type ElevenLabsProxyEvent =
  | { type: "ready" }
  | { type: "interim" | "final"; text: string }
  | { type: "error"; code: string }
  | null;

/** Translate vendor events into the small protocol understood by the client. */
export function parseElevenLabsEvent(raw: string): ElevenLabsProxyEvent {
  let event: { message_type?: unknown; text?: unknown };
  try {
    event = JSON.parse(raw) as { message_type?: unknown; text?: unknown };
  } catch {
    return null;
  }

  const messageType =
    typeof event.message_type === "string" ? event.message_type : "";

  if (messageType === "session_started") return { type: "ready" };

  const text = typeof event.text === "string" ? event.text.trim() : "";
  if (messageType === "partial_transcript" && text) {
    return { type: "interim", text };
  }
  if (messageType === "committed_transcript" && text) {
    return { type: "final", text };
  }

  // ElevenLabs uses specific message types such as `auth_error`,
  // `input_error`, and `transcriber_error`. Keep only the type in logs: a raw
  // upstream error can include request details, which here may be clinical.
  if (messageType === "error" || messageType.endsWith("_error")) {
    return { type: "error", code: messageType || "error" };
  }

  return null;
}
