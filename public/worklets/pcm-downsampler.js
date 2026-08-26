/**
 * AudioWorklet processor: float32 @ context rate -> Int16 PCM @ 16 kHz mono.
 *
 * ElevenLabs realtime accepts raw mono PCM (linear16), while MediaRecorder
 * produces container formats such as WebM or MP4. The live path therefore
 * cannot reuse the archival recorder's output and needs its own tap on the
 * audio graph.
 *
 * It runs as a Worklet rather than a ScriptProcessorNode because Worklets run
 * off the main thread. A ScriptProcessorNode drops samples whenever React
 * re-renders, which on a live transcript means dropped words.
 *
 * Note this file is deliberately plain JS in `public/` — Worklet modules are
 * fetched by URL at runtime and are not part of the bundle graph.
 */

const TARGET_RATE = 16000;
// ~100 ms at 16 kHz. Large enough to keep postMessage traffic low, small
// enough that interim transcripts still feel live.
const FRAME_SIZE = 1600;

class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(FRAME_SIZE);
    this._offset = 0;
    // Fractional read position into the incoming block, carried across blocks
    // so the resampling phase stays continuous and we don't click every 128
    // samples.
    this._phase = 0;
    this._muted = false;

    this.port.onmessage = (event) => {
      if (event.data?.type === "mute") this._muted = Boolean(event.data.value);
    };
  }

  process(inputs) {
    const input = inputs[0];
    // No input channel yet (graph still connecting) — keep the node alive.
    if (!input || input.length === 0 || !input[0]) return true;

    const channel = input[0];
    if (this._muted) return true;

    // `sampleRate` is a global inside the AudioWorkletGlobalScope and reflects
    // the real hardware rate. We never assume 48 kHz: the getUserMedia
    // sampleRate constraint is widely ignored by browsers, and phones vary.
    const ratio = sampleRate / TARGET_RATE;

    let readIndex = this._phase;
    while (readIndex < channel.length) {
      const i = Math.floor(readIndex);
      // Linear interpolation between neighbouring samples. Cheap, and well
      // above the quality floor for speech at 16 kHz.
      const frac = readIndex - i;
      const a = channel[i];
      const b = i + 1 < channel.length ? channel[i + 1] : a;
      const sample = a + (b - a) * frac;

      const clamped = Math.max(-1, Math.min(1, sample));
      this._buffer[this._offset++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this._offset === FRAME_SIZE) {
        // Transfer the buffer rather than copying it across the thread boundary.
        const out = this._buffer.slice();
        this.port.postMessage({ type: "pcm", payload: out.buffer }, [out.buffer]);
        this._offset = 0;
      }

      readIndex += ratio;
    }

    this._phase = readIndex - channel.length;
    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsampler);
