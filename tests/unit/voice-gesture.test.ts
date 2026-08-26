import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { voiceTapAction } from "../../src/lib/audio/voice-gesture.ts";

test("the first microphone tap starts recording", () => {
  assert.equal(voiceTapAction({ listening: false, busy: false }), "start");
});

test("the next microphone tap stops recording", () => {
  assert.equal(voiceTapAction({ listening: true, busy: false }), "stop");
});

test("microphone taps are ignored while audio is being processed", () => {
  assert.equal(voiceTapAction({ listening: false, busy: true }), "none");
});

test("the microphone control uses clicks only, with no hold gesture", () => {
  const source = readFileSync("src/components/voice/voice-dock.tsx", "utf8");

  assert.equal(source.includes("onPointerDown"), false);
  assert.equal(source.includes("onPointerUp"), false);
  assert.equal(source.includes("onPointerMove"), false);
  assert.equal(source.includes("Slide to lock"), false);
  assert.equal(source.match(/onClick=\{handleToggle\}/g)?.length, 2);
});
