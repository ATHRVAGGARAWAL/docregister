import assert from "node:assert/strict";
import { test } from "node:test";

import { normaliseFrequency } from "../../src/lib/llm/dosage.ts";

/**
 * The dosage table is the one place this app refuses to trust the model, on the
 * grounds that a rule table gets "1-0-1" right every time and an LLM gets it
 * right most of the time — the wrong reliability class for a prescription.
 *
 * That argument only holds if the table is actually right, which nothing
 * checked until now. These are the cases the README and the module's own
 * comments claim to handle.
 */

test("the four spellings of twice daily all normalise together", () => {
  for (const spoken of ["BD", "1-0-1", "do baar", "ਦੋ ਵਾਰ"]) {
    const result = normaliseFrequency(spoken);
    assert.equal(result.code, "BD", `${spoken} should be BD, got ${result.code}`);
    assert.equal(result.needsReview, false, `${spoken} should not need review`);
  }
});

test("once daily and as-needed are distinguished", () => {
  assert.equal(normaliseFrequency("OD").code, "OD");
  assert.equal(normaliseFrequency("once daily").code, "OD");
  assert.equal(normaliseFrequency("SOS").code, "SOS");
  assert.equal(normaliseFrequency("as needed").code, "SOS");
});

test("an unrecognised frequency is flagged rather than guessed", () => {
  const result = normaliseFrequency("whenever he feels like it");
  assert.equal(result.needsReview, true);
});

test("a frequency the doctor never stated is flagged, not treated as fine", () => {
  // This was the inverted case: a garbled frequency was flagged while a missing
  // one was not, so the prescription line most in need of a human look was the
  // one that got none.
  const result = normaliseFrequency(null);
  assert.equal(result.needsReview, true, "a null frequency must ask for review");
});

test("native-script frequencies are reachable at all", () => {
  // Every Gurmukhi and Devanagari pattern in the table was written with a `\b`,
  // and JavaScript's word boundary is ASCII-only — so none of them could ever
  // match. In an app whose premise is code-mixed Hindi/Punjabi dictation, the
  // romanised spelling worked and the one the doctor actually speaks did not.
  const cases: [string, string][] = [
    ["ਦੋ ਵਾਰ", "BD"],
    ["दो बार", "BD"],
    ["सुबह शाम", "BD"],
    ["ਇੱਕ ਵਾਰ", "OD"],
    ["एक बार", "OD"],
  ];
  for (const [spoken, code] of cases) {
    const result = normaliseFrequency(spoken);
    assert.equal(result.code, code, `${spoken} should be ${code}, got ${result.code}`);
    assert.equal(result.needsReview, false, `${spoken} should not need review`);
  }
});
