import "server-only";

import { sttProviderName } from "@/lib/env";
import { ElevenLabsProvider } from "./elevenlabs";
import { MockSttProvider } from "./mock";
import { SarvamProvider } from "./sarvam";
import { SttError, type SttProvider, type TranscribeInput, type TranscribeResult } from "./types";

export * from "./types";
export { SARVAM_SYNC_LIMIT_MS } from "./sarvam";

let cached: SttProvider | undefined;

export function getSttProvider(): SttProvider {
  if (cached) return cached;
  switch (sttProviderName()) {
    case "sarvam":
      cached = new SarvamProvider();
      break;
    case "elevenlabs":
      cached = new ElevenLabsProvider();
      break;
    case "mock":
      cached = new MockSttProvider();
      break;
  }
  return cached!;
}

/**
 * The other real engine, whichever one is not primary.
 *
 * Written as a function of the primary rather than hardcoded to ElevenLabs so
 * that flipping `STT_PROVIDER` swaps the pair instead of quietly deleting the
 * safety net — an earlier version returned ElevenLabs unconditionally and
 * disabled failover for the one configuration where the primary is ElevenLabs.
 * `mock` has no partner: failing over from an offline stub to a paid API would
 * turn a keyless dev run into a live billed request.
 */
function fallbackFor(primary: SttProvider): SttProvider | undefined {
  if (primary.name === "sarvam") return new ElevenLabsProvider();
  if (primary.name === "elevenlabs") return new SarvamProvider();
  return undefined;
}

/**
 * Transcribe with a single automatic failover.
 *
 * Failover is deliberately narrow. It fires only on a retryable transport or
 * 5xx error, never on a bad-audio or auth error, and it reports which provider
 * actually produced the text so the doctor can be told when a note came from
 * the weaker engine. Silently degrading transcription quality on a clinical
 * record is worse than surfacing an error.
 */
export async function transcribeWithFailover(
  input: TranscribeInput,
): Promise<TranscribeResult & { degraded: boolean }> {
  const primary = getSttProvider();

  try {
    const result = await primary.transcribe(input);

    // Sarvam can also give us a romanised rendering, which is much easier to
    // skim on a phone. Best-effort: never blocks the encounter.
    if (primary instanceof SarvamProvider && !result.romanText) {
      result.romanText = await primary.romanise(input);
    }

    return { ...result, degraded: false };
  } catch (error) {
    const fallback = error instanceof SttError && error.retryable
      ? fallbackFor(primary)
      : undefined;

    if (!fallback) throw error;

    const result = await fallback.transcribe(input);
    return { ...result, degraded: true };
  }
}
