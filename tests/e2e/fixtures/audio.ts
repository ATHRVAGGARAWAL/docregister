import { renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A microphone, for a browser that has none.
 *
 * The dictation flow cannot be driven without one. `VoiceRecorder.start()`
 * calls `getUserMedia`, and everything downstream hangs off the stream it
 * returns: the analyser that drives the waveform, the MediaRecorder blob that
 * is the transcript of record, and the 1KB "did anything arrive" floor in
 * `useVoiceCapture.stop()` that rejects a recording as a muted microphone.
 * Chromium can synthesise that stream from a WAV file, so the suite writes one
 * and points the browser at it.
 */

const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * Long enough that Chromium never loops back to the start of the file during a
 * take. It loops seamlessly if it does; the margin is here so that a recording
 * which runs longer than expected stays easy to reason about.
 */
const SECONDS = 8;

/**
 * What is in the file is not load-bearing for any assertion.
 *
 * The transcript is stubbed, so nothing downstream reads these samples — a
 * sine tone would pass every test here. The one worry worth answering is the
 * opposite one: that Chromium's `noiseSuppression` and `autoGainControl`,
 * which `VoiceRecorder` asks for, would eat a synthetic signal and leave a
 * blob under the 1KB floor `useVoiceCapture.stop()` rejects. Driven through
 * the app's own graph, this signal does not come close to that floor — see the
 * sizes recorded above `MIN_DICTATION_UPLOAD_BYTES`.
 *
 * It is voice-shaped anyway because the one thing content does change is the
 * analyser: a syllable envelope gives the level meter and the waveform
 * something that moves, which is what they would show in a consultation.
 */
function speechLikeWav(): Buffer {
  const frames = SAMPLE_RATE * SECONDS;
  const bytesPerFrame = CHANNELS * (BITS_PER_SAMPLE / 8);
  const data = Buffer.alloc(frames * bytesPerFrame);

  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / SAMPLE_RATE;
    // Roughly 4.5 syllables a second, squared so the gaps between them are real
    // silence rather than a dip.
    const envelope = Math.max(0, Math.sin(2 * Math.PI * 4.5 * t)) ** 2;
    const buzz =
      Math.sin(2 * Math.PI * 130 * t) +
      0.5 * Math.sin(2 * Math.PI * 260 * t) +
      0.3 * Math.sin(2 * Math.PI * 520 * t) +
      0.2 * Math.sin(2 * Math.PI * 1040 * t);
    // 0.22 against a peak of 2.0 leaves headroom, so nothing clips.
    data.writeInt16LE(Math.round(0.22 * envelope * buzz * 32767), frame * bytesPerFrame);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM header length
  header.writeUInt16LE(1, 20); // format: uncompressed PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * bytesPerFrame, 28); // byte rate
  header.writeUInt16LE(bytesPerFrame, 32); // block align
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/**
 * Write the fake dictation to a temp path and return it.
 *
 * Outside the repository, because a suite that leaves generated audio in the
 * working tree is a suite people stop running before they commit. Staged under
 * a pid-suffixed name and renamed into place so a second run starting while
 * this one writes cannot hand Chromium half a file.
 */
export function fakeDictationWav(): string {
  const target = path.join(os.tmpdir(), "docregister-e2e-dictation.wav");
  const staging = `${target}.${process.pid}`;
  writeFileSync(staging, speechLikeWav());
  renameSync(staging, target);
  return target;
}

/**
 * Chromium's flags for capturing from that file instead of from hardware.
 *
 * These belong to a browser launch, so the spec passes them through its own
 * `launchOptions` rather than `playwright.config.ts` — the rest of the suite
 * has no reason to run against a synthetic microphone, and a project-wide flag
 * would silently apply to specs that never asked for one.
 *
 * `--use-fake-ui-for-media-stream` auto-accepts the permission prompt. The spec
 * *also* grants microphone permission on the context, which is not redundant:
 * the flag answers the prompt, the grant is what `navigator.permissions`
 * reports, and code that checks the latter before calling `getUserMedia` needs
 * both to agree.
 */
export function fakeMicrophoneArgs(wavPath: string): string[] {
  return [
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wavPath}`,
    "--use-fake-ui-for-media-stream",
  ];
}

/**
 * A floor for "the microphone really produced audio", in bytes of multipart
 * request body.
 *
 * Four times the app's own 1KB floor, and far under what the spec's two-second
 * recording actually sends: three consecutive runs measured 26,683, 28,621 and
 * 28,861 bytes. The gap in both directions is deliberate — high enough that a
 * silent or empty capture cannot clear it, low enough that it is not really an
 * assertion about the encoder's bitrate, which is free to drift between
 * Chromium builds.
 */
export const MIN_DICTATION_UPLOAD_BYTES = 4096;
