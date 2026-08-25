"use client";

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
  private recorder?: MediaRecorder;
  private chunks: BlobPart[] = [];
  private rafId?: number;
  private startedAt = 0;
  private negotiatedMime = "";

  constructor(private readonly callbacks: RecorderCallbacks = {}) {}

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

    this.context = new AudioCtx();
    // Resume before any await, while we are still inside the gesture.
    const resumed = this.context.resume();

    this.stream = await navigator.mediaDevices.getUserMedia({
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

    await resumed;

    this.source = this.context.createMediaStreamSource(this.stream);

    // --- Branch 1: waveform ------------------------------------------------
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;
    this.source.connect(this.analyser);
    this.pumpLevels();

    // --- Branch 2: live PCM ------------------------------------------------
    // Best-effort. If the worklet fails to load, recording still works and the
    // doctor simply loses the live transcript, not the note.
    try {
      await this.context.audioWorklet.addModule("/worklets/pcm-downsampler.js");
      this.worklet = new AudioWorkletNode(this.context, "pcm-downsampler");
      this.worklet.port.onmessage = (event) => {
        if (event.data?.type === "pcm") {
          this.callbacks.onPcmFrame?.(event.data.payload as ArrayBuffer);
        }
      };
      this.source.connect(this.worklet);
      // Not connected to destination: we do not want to hear the doctor's own
      // voice played back, and an unconnected worklet still receives input.
    } catch (error) {
      this.callbacks.onError?.(
        new Error(`Live transcription unavailable: ${String(error)}`),
      );
    }

    // --- Branch 3: archival recording -------------------------------------
    const destination = this.context.createMediaStreamDestination();
    this.source.connect(destination);

    const { mimeType } = pickMimeType();
    this.recorder = new MediaRecorder(
      destination.stream,
      mimeType ? { mimeType } : undefined,
    );
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
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Recorder was not started");

    const durationMs = performance.now() - this.startedAt;
    const sampleRate = this.context?.sampleRate ?? 0;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.negotiatedMime }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob(this.chunks, { type: this.negotiatedMime }));
    });

    this.teardown();

    return { blob, mimeType: this.negotiatedMime, durationMs, sampleRate };
  }

  /** Abandon the recording without producing a blob. */
  cancel(): void {
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
    this.analyser?.disconnect();
    this.source?.disconnect();

    // Stopping every track is what turns off the OS microphone indicator. A
    // recording light that stays on after a consultation is alarming to a
    // doctor and looks like the app is still listening — because it is.
    this.stream?.getTracks().forEach((track) => track.stop());

    void this.context?.close().catch(() => undefined);

    this.stream = undefined;
    this.context = undefined;
    this.source = undefined;
    this.analyser = undefined;
    this.worklet = undefined;
    this.recorder = undefined;
  }
}
