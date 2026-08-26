import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RECORDING_AUDIO_BITS_PER_SECOND,
  RECORDING_LIMIT_MS,
  RECORDING_UPLOAD_LIMIT_BYTES,
  RECORDING_UPLOAD_LIMIT_MS,
  RECORDING_WARNING_MS,
} from "../../src/lib/audio/limits.ts";

test("voice capture allows a full minute and warns during the final ten seconds", () => {
  assert.equal(RECORDING_LIMIT_MS, 60_000);
  assert.equal(RECORDING_WARNING_MS, 50_000);
  assert.ok(RECORDING_UPLOAD_LIMIT_MS > RECORDING_LIMIT_MS);
  assert.equal(RECORDING_AUDIO_BITS_PER_SECOND, 96_000);
  assert.equal(RECORDING_UPLOAD_LIMIT_BYTES, 4 * 1024 * 1024);
});
