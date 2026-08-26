import assert from "node:assert/strict";
import test from "node:test";

import {
  isKeyboardVoiceActivation,
  voicePointerDownIntent,
  voicePointerReleaseIntent,
} from "../../src/lib/audio/voice-gesture.ts";

test("a first tap starts once and its release locks hands-free recording", () => {
  const down = voicePointerDownIntent({ listening: false, busy: false });
  const up = voicePointerReleaseIntent({
    pointerIntent: down,
    listening: true,
    locked: false,
    cancelled: false,
    heldForMs: 120,
    travelPx: 2,
  });

  assert.equal(down, "start");
  assert.equal(up, "lock");
});

test("a second tap stops immediately while arming or listening", () => {
  assert.equal(voicePointerDownIntent({ listening: true, busy: false }), "stop");
});

test("a stop pointer does not fire another action on release or synthetic click", () => {
  assert.equal(
    voicePointerReleaseIntent({
      pointerIntent: "stop",
      listening: true,
      locked: false,
      cancelled: false,
      heldForMs: 80,
      travelPx: 0,
    }),
    "none",
  );
  assert.equal(isKeyboardVoiceActivation(1), false);
});

test("releasing a hold still stops the recording", () => {
  assert.equal(
    voicePointerReleaseIntent({
      pointerIntent: "start",
      listening: true,
      locked: false,
      cancelled: false,
      heldForMs: 600,
      travelPx: 0,
    }),
    "stop",
  );
});

test("keyboard and assistive clicks retain start-stop operation", () => {
  assert.equal(isKeyboardVoiceActivation(0), true);
});
