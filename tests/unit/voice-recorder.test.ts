import assert from "node:assert/strict";
import test from "node:test";

import { VoiceRecorder } from "../../src/lib/audio/recorder.ts";
import { RECORDING_AUDIO_BITS_PER_SECOND } from "../../src/lib/audio/limits.ts";

class FakeNode {
  connect() {
    return this;
  }

  disconnect() {}
}

class FakeAnalyser extends FakeNode {
  fftSize = 1024;
  smoothingTimeConstant = 0;
  frequencyBinCount = 512;

  getByteFrequencyData() {}
  getByteTimeDomainData() {}
}

class FakeWorkletNode extends FakeNode {
  port = { close() {}, onmessage: null as ((event: MessageEvent) => void) | null };
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }

  mimeType = "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  readonly options?: MediaRecorderOptions;

  constructor(_stream?: MediaStream, options?: MediaRecorderOptions) {
    this.options = options;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

test("archival recording starts without waiting for the optional AudioWorklet", async () => {
  const workletNeverLoads = new Promise<void>(() => undefined);
  const track = { stopped: false, stop() { this.stopped = true; } };
  const restore = installBrowserAudioMocks({
    getUserMedia: async () => ({ getTracks: () => [track] }),
    addModule: () => workletNeverLoads,
  });

  try {
    const recorder = new VoiceRecorder();
    await Promise.race([
      recorder.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("start timed out")), 50)),
    ]);

    assert.equal(FakeMediaRecorder.instances.at(-1)?.state, "recording");
    recorder.cancel();
    assert.equal(track.stopped, true);
  } finally {
    restore();
  }
});

test("cancelling while permission is pending stops a later-arriving stream", async () => {
  let releaseStream!: (stream: { getTracks: () => { stopped: boolean; stop(): void }[] }) => void;
  const pendingStream = new Promise<{ getTracks: () => { stopped: boolean; stop(): void }[] }>(
    (resolve) => {
      releaseStream = resolve;
    },
  );
  const track = { stopped: false, stop() { this.stopped = true; } };
  const restore = installBrowserAudioMocks({
    getUserMedia: () => pendingStream,
    addModule: async () => undefined,
  });

  try {
    const recorder = new VoiceRecorder();
    const starting = recorder.start();
    recorder.cancel();
    releaseStream({ getTracks: () => [track] });

    await assert.rejects(starting, (error: Error) => error.name === "AbortError");
    assert.equal(track.stopped, true);
  } finally {
    restore();
  }
});

test("stopping finalises the blob and releases the microphone immediately", async () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const restore = installBrowserAudioMocks({
    getUserMedia: async () => ({ getTracks: () => [track] }),
    addModule: async () => undefined,
  });

  try {
    const recorder = new VoiceRecorder();
    await recorder.start();

    const mediaRecorder = FakeMediaRecorder.instances.at(-1);
    assert.equal(mediaRecorder?.options?.audioBitsPerSecond, RECORDING_AUDIO_BITS_PER_SECOND);

    const result = await recorder.stop();
    assert.equal(track.stopped, true);
    assert.equal(await result.blob.text(), "recorded voice");
    assert.equal(result.mimeType, "audio/webm;codecs=opus");
  } finally {
    restore();
  }
});

function installBrowserAudioMocks({
  getUserMedia,
  addModule,
}: {
  getUserMedia: () => Promise<{ getTracks: () => { stop(): void }[] }>;
  addModule: () => Promise<void>;
}) {
  FakeMediaRecorder.instances = [];
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };

  class FakeAudioContext {
    sampleRate = 48_000;
    destination = new FakeNode();
    audioWorklet = { addModule };

    resume() {
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }

    createMediaStreamSource() {
      return new FakeNode();
    }

    createAnalyser() {
      return new FakeAnalyser();
    }

    createMediaStreamDestination() {
      return { stream: {} };
    }

    createGain() {
      return Object.assign(new FakeNode(), { gain: { value: 1 } });
    }
  }

  replace("window", { AudioContext: FakeAudioContext, isSecureContext: true });
  replace("navigator", {
    userAgent: "Chrome",
    mediaDevices: { getUserMedia },
  });
  replace("MediaRecorder", FakeMediaRecorder);
  replace("AudioWorkletNode", FakeWorkletNode);
  replace("requestAnimationFrame", () => 1);
  replace("cancelAnimationFrame", () => undefined);

  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
}
