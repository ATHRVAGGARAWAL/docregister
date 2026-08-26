import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ELEVENLABS_REALTIME_MODEL,
  ELEVENLABS_SAMPLE_RATE,
  elevenLabsAudioMessage,
  elevenLabsRealtimeUrl,
  parseElevenLabsEvent,
} from "../../server/elevenlabs-realtime.ts";

test("ElevenLabs realtime URL requests 16 kHz PCM with VAD commits", () => {
  const url = new URL(elevenLabsRealtimeUrl());

  assert.equal(url.protocol, "wss:");
  assert.equal(url.pathname, "/v1/speech-to-text/realtime");
  assert.equal(url.searchParams.get("model_id"), ELEVENLABS_REALTIME_MODEL);
  assert.equal(url.searchParams.get("audio_format"), "pcm_16000");
  assert.equal(url.searchParams.get("commit_strategy"), "vad");
});

test("raw PCM is encoded in ElevenLabs' JSON/base64 wire format", () => {
  const message = JSON.parse(
    elevenLabsAudioMessage(new Uint8Array([0, 1, 254, 255])),
  ) as Record<string, unknown>;

  assert.deepEqual(message, {
    message_type: "input_audio_chunk",
    audio_base_64: "AAH+/w==",
    commit: false,
    sample_rate: ELEVENLABS_SAMPLE_RATE,
  });

  const commit = JSON.parse(
    elevenLabsAudioMessage(new Uint8Array(), { commit: true }),
  ) as Record<string, unknown>;
  assert.equal(commit.audio_base_64, "");
  assert.equal(commit.commit, true);
});

test("ElevenLabs events map onto the existing browser protocol", () => {
  assert.deepEqual(
    parseElevenLabsEvent('{"message_type":"session_started"}'),
    { type: "ready" },
  );
  assert.deepEqual(
    parseElevenLabsEvent(
      '{"message_type":"partial_transcript","text":"hello wor"}',
    ),
    { type: "interim", text: "hello wor" },
  );
  assert.deepEqual(
    parseElevenLabsEvent(
      '{"message_type":"committed_transcript","text":"hello world"}',
    ),
    { type: "final", text: "hello world" },
  );
  assert.deepEqual(
    parseElevenLabsEvent('{"message_type":"input_error","error":"bad"}'),
    { type: "error", code: "input_error" },
  );
  assert.equal(parseElevenLabsEvent("not json"), null);
});
