import assert from "node:assert/strict";
import { test } from "node:test";

import { findInteractions, moleculesIn } from "../../src/lib/clinical/interactions.ts";

const rx = (...names: string[]) => names.map((drug_name) => ({ drug_name }));
const ids = (names: string[]) => findInteractions(rx(...names)).map((f) => f.id);

test("the pair that must never be missed", () => {
  assert.deepEqual(ids(["Nitroglycerin 0.5 mg", "Sildenafil 50 mg"]), ["nitrate-pde5"]);
  assert.deepEqual(ids(["Isosorbide mononitrate", "Tadalafil 10 mg"]), ["nitrate-pde5"]);
  // Nicorandil is a nitric oxide donor and carries the same contraindication.
  assert.deepEqual(ids(["Nicorandil 5 mg", "Sildenafil"]), ["nitrate-pde5"]);
  assert.equal(findInteractions(rx("Nitroglycerin", "Sildenafil"))[0].severity, "contraindicated");
});

test("a nitrate patch or ointment still counts", () => {
  // The deleted version excluded `patch` and `ointment` as non-systemic, which
  // is exactly backwards: those are the presentations where a nitrate IS
  // systemic. There is no form-based exclusion here at all — a false alarm on
  // this pair costs a glance, and a missed one costs blood pressure.
  assert.deepEqual(ids(["Nitroglycerin patch", "Sildenafil"]), ["nitrate-pde5"]);
  assert.deepEqual(ids(["Nitroglycerin ointment", "Tadalafil"]), ["nitrate-pde5"]);
});

test("near-miss names must not fire", () => {
  // The whole point of word-boundary matching. Nitrofurantoin is an antibiotic.
  assert.deepEqual(moleculesIn("Nitrofurantoin 100 mg"), []);
  assert.deepEqual(ids(["Nitrofurantoin 100 mg", "Sildenafil 50 mg"]), []);
  // Paracetamol is not an NSAID, so this is not a duplication.
  assert.deepEqual(ids(["Paracetamol 500 mg", "Dolo 650"]), []);
  assert.deepEqual(moleculesIn("Vitamin D3"), []);
  assert.deepEqual(moleculesIn(""), []);
});

test("Meftal-P is mefenamic acid, not paracetamol", () => {
  // The specific error that got the previous version deleted. Meftal-P is the
  // paediatric mefenamic acid suspension. Classifying it as paracetamol both
  // invented a warning and suppressed the NSAID duplication below.
  assert.deepEqual(moleculesIn("Meftal-P suspension"), ["nsaid"]);
  assert.ok(!moleculesIn("Meftal-P suspension").includes("paracetamol"));
  assert.deepEqual(ids(["Meftal-P 5 ml", "Ibuprofen 200 mg"]), ["nsaid-duplicate"]);
});

test("sourced combination brands supply both molecules", () => {
  assert.deepEqual(moleculesIn("Combiflam").sort(), ["nsaid", "paracetamol"]);
  assert.deepEqual(moleculesIn("Zerodol-P").sort(), ["nsaid", "paracetamol"]);
  // Plain Zerodol is aceclofenac alone.
  assert.deepEqual(moleculesIn("Zerodol 100 mg"), ["nsaid"]);
  assert.deepEqual(moleculesIn("Dolo 650"), ["paracetamol"]);
});

test("one product containing both sides is not an interaction", () => {
  // Combiflam is an NSAID and paracetamol in one tablet. That is a formulation
  // somebody already decided on, not a prescribing error, and warning about it
  // on every line would train a doctor to dismiss this panel.
  assert.deepEqual(ids(["Combiflam"]), []);
  assert.deepEqual(ids(["Zerodol-P"]), []);
  // Two separate NSAID lines is the case worth raising.
  assert.deepEqual(ids(["Combiflam", "Diclofenac 50 mg"]), ["nsaid-duplicate"]);
});

test("the remaining two rules, and their ordering", () => {
  // One NSAID, so the duplication rule does not also fire.
  assert.deepEqual(ids(["Warfarin 5 mg", "Ibuprofen 400 mg"]), ["warfarin-nsaid"]);
  assert.deepEqual(ids(["Acitrom 2 mg", "Diclofenac 50 mg"]), ["warfarin-nsaid"]);
  assert.deepEqual(ids(["Tramadol 50 mg", "Sertraline 50 mg"]), ["tramadol-ssri"]);

  // Most severe first, so the contraindication is never below a caution.
  const many = findInteractions(rx("Nitroglycerin", "Sildenafil", "Ibuprofen", "Diclofenac"));
  assert.deepEqual(
    many.map((f) => f.severity),
    ["contraindicated", "caution"],
  );
});

test("every rule carries a source and a doctor-readable detail", () => {
  const all = findInteractions(
    rx("Nitroglycerin", "Sildenafil", "Warfarin", "Ibuprofen", "Tramadol", "Sertraline"),
  );
  assert.ok(all.length >= 3, "expected the three named pairs to fire");
  for (const finding of all) {
    assert.ok(finding.source.length > 10, `${finding.id} has no source`);
    assert.ok(finding.detail.length > 40, `${finding.id} has no usable detail`);
    // No provider strings, no jargon a doctor cannot act on.
    assert.doesNotMatch(finding.detail, /PGRST|undefined|null|\[object/i);
  }
});
