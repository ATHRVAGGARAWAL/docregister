"use client";

import { RECORDING_AUDIO_BITS_PER_SECOND } from "./limits.ts";

/**
 * Dual-path audio capture.
 *
 * One microphone stream feeds three consumers:
 *
 *   getUserMedia -> MediaStreamAudioSourceNode
 *                     |- AnalyserNode ............ waveform (rAF, main thread)
 *                     |- AudioWorkletNode ........ Int16 PCM -> live WS proxy
 *                     '- MediaStreamDestination -> MediaRecorder -> Blob
 *
 * The MediaRecorder blob is the **transcript of record**: it goes to the batch
 * STT endpoint and its result is what lands in the patient's chart. The live
 * WebSocket transcript is UI feedback only. Conflating the two would put a
 * partial, unconfirmed stream into a medical record.
 */

export type MimeChoice = { mimeType: string; extension: string };

/**
 * How long to wait for MediaRecorder to hand back the final blob before giving
 * up on it. Generous — finalising a container is real work on a slow phone —
 * but bounded, because the alternative is an await that never returns.
 */
const STOP_TIMEOUT_MS = 5_000;

/**
 * Pick a container the browser will actually produce.
 *
 * Order matters and is the opposite of what most tutorials say. Safari before
 * 18.4 supported only MP4/AAC and returned false for every WebM query, so a
 * hardcoded `audio/webm;codecs=opus` silently yields an empty recording on a
 * large share of iPhones. We probe MP4 first on WebKit.
 */
export function pickMimeType(): MimeChoice {
  const isWebKit =
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Edg/.test(navigator.userAgent);

  const candidates: MimeChoice[] = isWebKit
    ? [
        { mimeType: "audio/mp4", extension: "m4a" },
        { mimeType: "audio/webm;codecs=opus", extension: "webm" },
        { mimeType: "audio/webm", extension: "webm" },
      ]
    : [
        { mimeType: "audio/webm;codecs=opus", extension: "webm" },
        { mimeType: "audio/webm", extension: "webm" },
        { mimeType: "audio/mp4", extension: "m4a" },
        { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
      ];

  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(candidate.mimeType)
    ) {
      return candidate;
    }
  }

  // Let the browser choose. `recorder.mimeType` is read back after start, so
  // the server always receives the real negotiated type.
  return { mimeType: "", extension: "bin" };
}

export interface RecorderCallbacks {
  /** Int16 PCM @ 16 kHz, ready for the live proxy. */
  onPcmFrame?: (frame: ArrayBuffer) => void;
  /** 0..1 amplitude for the waveform, sampled once per animation frame. */
  onLevel?: (level: number, spectrum: Uint8Array) => void;
  onError?: (error: Error) => void;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  sampleRate: number;
}

export class VoiceRecorder {
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private worklet?: AudioWorkletNode;
  private workletSink?: GainNode;
  private recorder?: MediaRecorder;
  private chunks: BlobPart[] = [];
  private rafId?: number;
  private startedAt = 0;
  private negotiatedMime = "";
  private cancelled = false;
  private readonly callbacks: RecorderCallbacks;

  constructor(callbacks: RecorderCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  /**
   * Must be called synchronously from a user-gesture handler.
   *
   * iOS creates every AudioContext in the `suspended` state and only allows
   * `resume()` inside a genuine user gesture. Constructing the context on mount
   * — or after an `await` that breaks the gesture chain — produces a recorder
   * that captures silence and a waveform that never moves. This is the single
   * most common iOS voice-capture bug.
   */
  async start(): Promise<void> {
    // Preflight, before the AudioContext exists. `navigator.mediaDevices` is
    // undefined — not a method that rejects — outside a secure context, so
    // calling straight through throws a bare TypeError that reads to the caller
    // like a broken device. It is neither: the hardware is fine and the origin
    // is not. http://<lan-ip>:3000, the URL `next dev` prints for testing on a
    // real phone, is exactly that origin, so this is the first thing a doctor
    // trying the app on their own handset would hit.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const insecure = typeof window !== "undefined" && !window.isSecureContext;
      const error = new Error(
        insecure
          ? "Recording needs a secure connection. Open the app over https, or on localhost."
          : "This browser cannot record audio.",
      );
      error.name = "MicUnavailableError";
      throw error;
    }

    const AudioCtx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.cancelled = false;
    const context = new AudioCtx();
    this.context = context;
    // Resume before any await, while we are still inside the gesture.
    const resumed = context.resume();
    // Attach a rejection handler immediately. Permission prompts can stay open
    // for a long time, during which Safari may reject `resume()`; waiting to add
    // the handler until after getUserMedia resolves produces an unhandled
    // rejection even though the failure is handled below.
    void resumed.catch(() => undefined);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          // Deliberately no `sampleRate` constraint: browsers largely ignore it,
          // and pretending otherwise leads to code that assumes 48 kHz. The
          // worklet reads the true rate at runtime instead.
        },
        video: false,
      });

      // A doctor can cancel while the browser permission sheet is still open.
      // getUserMedia is not abortable, so dispose of a stream that arrives after
      // cancellation instead of turning the microphone back on behind the UI.
      if (this.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        throw abortError();
      }

      this.stream = stream;
      await resumed;
      if (this.cancelled) throw abortError();

      // MediaRecorder is started synchronously here. Live PCM is optional and
      // initialises in the background, so a slow or unsupported AudioWorklet can
      // never strand the capture state in "arming" with a frozen 0:00 timer.
      this.buildGraph();
    } catch (cause) {
      this.teardown();
      throw cause;
    }
  }

  private buildGraph(): void {
    if (!this.context || !this.stream) throw new Error("Recorder was not started");
    this.source = this.context.createMediaStreamSource(this.stream);

    // --- Branch 1: waveform ------------------------------------------------
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;
    this.source.connect(this.analyser);
    this.pumpLevels();

    // --- Branch 2: archival recording -------------------------------------
    const destination = this.context.createMediaStreamDestination();
    this.source.connect(destination);

    const { mimeType } = pickMimeType();
    const recorderOptions: MediaRecorderOptions = {
      audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
      ...(mimeType ? { mimeType } : {}),
    };
    try {
      this.recorder = new MediaRecorder(destination.stream, recorderOptions);
    } catch {
      // Older WebKit builds may accept the MIME type but reject the bitrate
      // option. Falling back still records; the client-side byte ceiling keeps
      // an unexpectedly large result away from the hosting edge.
      this.recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined,
      );
    }
    this.negotiatedMime = this.recorder.mimeType || mimeType || "audio/webm";
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    // No timeslice argument, deliberately.
    //
    // Safari with `audio/mp4` and a timeslice emits fragmented MP4 whose moov
    // atom is never finalised. The fragments are not independently decodable,
    // and STT engines transcribe the first one or two words and stop. Taking
    // one blob at the end avoids the whole class of bug.
    this.recorder.start();
    this.startedAt = performance.now();

    // --- Branch 3: live PCM ------------------------------------------------
    // Best-effort and deliberately not awaited. The archival recording above
    // is the source of truth and must start even when WebKit takes a long time
    // to load an AudioWorklet module (or never resolves that promise at all).
    void this.startLivePcm(this.context, this.source);
  }

  private async startLivePcm(
    context: AudioContext,
    source: MediaStreamAudioSourceNode,
  ): Promise<void> {
    try {
      await context.audioWorklet.addModule("/worklets/pcm-downsampler.js");
      if (this.cancelled || this.context !== context || this.source !== source) return;

      const worklet = new AudioWorkletNode(context, "pcm-downsampler");
      const sink = context.createGain();
      sink.gain.value = 0;

      worklet.port.onmessage = (event) => {
        if (!this.cancelled && event.data?.type === "pcm") {
          this.callbacks.onPcmFrame?.(event.data.payload as ArrayBuffer);
        }
      };
      source.connect(worklet);
      // WebKit may prune an AudioWorklet graph that has no destination. A
      // zero-gain sink keeps it processing without playing the microphone back.
      worklet.connect(sink);
      sink.connect(context.destination);
      this.worklet = worklet;
      this.workletSink = sink;
    } catch (error) {
      if (this.cancelled || this.context !== context) return;
      this.callbacks.onError?.(
        new Error(`Live transcription unavailable: ${String(error)}`),
      );
    }
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Recorder was not started");

    const durationMs = performance.now() - this.startedAt;
    const sampleRate = this.context?.sampleRate ?? 0;

    // Three ways this promise can settle, and it must take one of them.
    //
    // It used to have only `onstop`. If MediaRecorder raised `error` instead of
    // firing `onstop` — or fired neither — the promise never settled: the
    // caller awaited it forever, the capture state machine stayed in
    // `listening`, the elapsed timer kept counting past the hard limit, and the
    // microphone stayed open with the OS recording indicator lit. That is the
    // one unrecoverable hang in the pipeline, and it strands the doctor holding
    // a phone that is still listening.
    //
    // Whatever the chunks amount to is still worth returning; the caller
    // already rejects a blob under 1 KB with a clear message, which is a better
    // outcome than an await that never returns.
    const blob = await new Promise<Blob>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new Blob(this.chunks, { type: this.negotiatedMime }));
      };
      const timer = setTimeout(settle, STOP_TIMEOUT_MS);

      recorder.onstop = settle;
      recorder.onerror = settle;

      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
          // MediaRecorder can take a moment to finalise its container, but the
          // microphone hardware no longer needs to remain live during that
          // wait. This turns off iOS's recording indicator as soon as Stop is
          // accepted while `dataavailable` still delivers the buffered audio.
          this.stopInputTracks();
        } catch {
          // Already stopping, or in a state that refuses stop(). Either way the
          // chunks are what they are.
          this.stopInputTracks();
          settle();
        }
      } else {
        this.stopInputTracks();
        settle();
      }
    });

    this.teardown();

    return { blob, mimeType: this.negotiatedMime, durationMs, sampleRate };
  }

  /** Abandon the recording without producing a blob. */
  cancel(): void {
    this.cancelled = true;
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* already stopped */
    }
    this.chunks = [];
    this.teardown();
  }

  private pumpLevels() {
    const analyser = this.analyser;
    if (!analyser || !this.callbacks.onLevel) return;

    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    const timeDomain = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteFrequencyData(spectrum);
      analyser.getByteTimeDomainData(timeDomain);

      // RMS around the 128 midpoint of the unsigned time-domain data.
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const v = (timeDomain[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeDomain.length);

      this.callbacks.onLevel?.(Math.min(1, rms * 3.2), spectrum);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private teardown() {
    if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;

    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.workletSink?.disconnect();
    this.analyser?.disconnect();
    this.source?.disconnect();

    // Stopping every track is what turns off the OS microphone indicator. A
    // recording light that stays on after a consultation is alarming to a
    // doctor and looks like the app is still listening — because it is.
    this.stopInputTracks();

    void this.context?.close().catch(() => undefined);

    this.stream = undefined;
    this.context = undefined;
    this.source = undefined;
    this.analyser = undefined;
    this.worklet = undefined;
    this.workletSink = undefined;
    this.recorder = undefined;
  }

  private stopInputTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}

function abortError(): Error {
  const error = new Error("Recording was cancelled.");
  error.name = "AbortError";
  return error;
}
