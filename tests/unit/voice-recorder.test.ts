import assert from "node:assert/strict";
import test from "node:test";

import { VoiceRecorder } from "../../src/lib/audio/recorder.ts";

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

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
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
