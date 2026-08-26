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

test("decorative microphone animations cannot intercept a tap", () => {
  const source = readFileSync("src/components/voice/voice-dock.tsx", "utf8");

  assert.match(
    source,
    /className="pointer-events-none absolute -inset-2 rounded-full border border-destructive\/35"/,
  );
  assert.match(
    source,
    /className="pointer-events-none absolute inset-0 rounded-full border border-primary\/35"/,
  );
  assert.match(
    source,
    /className="pressable relative z-10 grid size-14 touch-manipulation place-items-center[^"]*"/,
  );
});

test("every visible dictation entry point can stop an active recording", () => {
  const overview = readFileSync("src/components/dashboard/overview-view.tsx", "utf8");
  const dashboard = readFileSync("src/components/dashboard/dashboard.tsx", "utf8");

  assert.match(overview, /onClick=\{recording \? onStopDictation : onStartDictation\}/);
  assert.match(overview, /recording \? "Stop & review" : "Dictate a visit"/);
  assert.match(dashboard, /onStopDictation=\{\(\) => void capture\.stop\(\)\}/);
});

test("a failed upload keeps the recording available for an explicit retry", () => {
  const hook = readFileSync("src/hooks/use-voice-capture.ts", "utf8");
  const dock = readFileSync("src/components/voice/voice-dock.tsx", "utf8");

  assert.match(hook, /setRetryRecording\(retryable \? recording : null\)/);
  assert.match(hook, /retryTranscription/);
  assert.match(dock, /Retry transcription/);
});
