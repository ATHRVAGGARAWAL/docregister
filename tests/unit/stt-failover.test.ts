import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Read as source rather than imported, the way `design-contract.test.ts` does:
 * these modules resolve through the `@/` alias, which the unit runner
 * (`node --test --experimental-strip-types`) does not configure.
 */
function constantFrom(relativePath: string, name: string): number {
  const source = readFileSync(join(process.cwd(), relativePath), "utf8");
  const match = source.match(new RegExp(`${name}\\s*=\\s*([0-9_]+)`));
  assert.ok(match, `${name} not found in ${relativePath}`);
  return Number(match![1].replace(/_/g, ""));
}

/**
 * The recorder and Sarvam's sync endpoint disagree about how long a dictation
 * may be, and that gap is the whole reason Sarvam's `too_long` is marked
 * retryable — `stt/index.ts` gates failover to the other provider on that flag.
 *
 * Left unmarked, a Sarvam-primary deployment refuses every dictation between
 * the two numbers below and tells the doctor the recording was too long, about
 * a length the recorder had just invited them to use.
 *
 * If someone later lowers the recorder to Sarvam's ceiling, this fails — which
 * is the right moment to ask whether the failover still carries anything,
 * rather than learning it from a doctor who lost a 45-second consultation.
 */
test("the recorder allows a dictation longer than Sarvam's sync endpoint accepts", () => {
  const recorderLimit = constantFrom("src/lib/audio/limits.ts", "RECORDING_LIMIT_MS");
  const sarvamLimit = constantFrom("src/lib/stt/sarvam.ts", "SARVAM_SYNC_LIMIT_MS");

  assert.ok(
    recorderLimit > sarvamLimit,
    `recorder allows ${recorderLimit}ms, Sarvam accepts ${sarvamLimit}ms`,
  );
});

test("Sarvam marks an over-length recording retryable so failover can run", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/stt/sarvam.ts"), "utf8");
  const throwSite = source.slice(source.indexOf("SARVAM_SYNC_LIMIT_MS"));
  const tooLong = throwSite.slice(throwSite.indexOf('"too_long"'), throwSite.indexOf('"too_long"') + 40);

  assert.match(
    tooLong,
    /"too_long",\s*true/,
    "`too_long` must pass retryable=true, or stt/index.ts skips the fallback provider",
  );
});
