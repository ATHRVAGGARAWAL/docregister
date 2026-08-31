import assert from "node:assert/strict";
import { test } from "node:test";

import { inferScope, parseSitting } from "../../src/lib/dental/procedure.ts";
import {
  buildReviewChecklist,
  normaliseProcedures,
  normaliseToothFindings,
  type ReviewExtraction,
  type ReviewProcedure,
  type ReviewToothFinding,
} from "../../src/lib/encounters/review.ts";

function procedure(overrides: Partial<ReviewProcedure> = {}): ReviewProcedure {
  return {
    procedure_name: "Root canal",
    tooth_spoken: "36",
    surfaces_spoken: null,
    sitting_spoken: null,
    note: null,
    ...overrides,
  };
}

function extraction(procedures: ReviewProcedure[]): ReviewExtraction {
  return {
    patient_name: "Sunita Devi",
    age_years: 42,
    diagnosis: null,
    treatment: null,
    consultation_fee_inr: null,
    procedures,
    tooth_findings: [],
    prescription: [],
    uncertain_fields: [],
    notes_for_doctor: null,
  };
}

/* --------------------------------------------------------------------------
 * Sittings
 * ----------------------------------------------------------------------- */

test("sittings parse from the forms a dentist actually says", () => {
  assert.deepEqual(parseSitting("first sitting"), { sitting: 1, total: null, needsReview: false });
  assert.deepEqual(parseSitting("second of three"), { sitting: 2, total: 3, needsReview: false });
  assert.deepEqual(parseSitting("2 of 3"), { sitting: 2, total: 3, needsReview: false });
  assert.deepEqual(parseSitting("doosri sitting"), { sitting: 2, total: null, needsReview: false });
  assert.deepEqual(parseSitting("sitting 3"), { sitting: 3, total: null, needsReview: false });
});

test("speech that says nothing about sittings produces nothing", () => {
  // Most speech. This must not flag, or every procedure lands in the checklist
  // and the queue becomes noise the dentist learns to clear without reading.
  for (const quiet of [null, "", "root canal", "composite filling on the molar"]) {
    assert.deepEqual(
      parseSitting(quiet),
      { sitting: null, total: null, needsReview: false },
      `"${quiet}" should be silent`,
    );
  }
});

test("an impossible sitting is refused rather than half-read", () => {
  // "third of two" is not a thing. Keeping the 3 and dropping the 2 would put a
  // confident wrong number on a record.
  assert.deepEqual(parseSitting("third of two"), { sitting: null, total: null, needsReview: true });
  assert.deepEqual(parseSitting("5 of 2"), { sitting: null, total: null, needsReview: true });
  assert.equal(parseSitting("sitting ninety nine").needsReview, true);
});

/* --------------------------------------------------------------------------
 * Scope
 * ----------------------------------------------------------------------- */

test("scope widens only when there is no tooth", () => {
  assert.equal(inferScope("Root canal", 36), "tooth");
  // A resolved tooth always wins, even for a name that sounds full-mouth.
  assert.equal(inferScope("Scaling and polishing", 36), "tooth");
  assert.equal(inferScope("Scaling and polishing", null), "full_mouth");
  assert.equal(inferScope("X-ray — OPG", null), "full_mouth");
  assert.equal(inferScope("Complete denture", null), "arch");
  // Unrecognised and toothless falls to `other`, which stores NO location —
  // so a wrong guess records an absence, never a wrong tooth.
  assert.equal(inferScope("Consultation", null), "other");
});

/* --------------------------------------------------------------------------
 * Normalisation
 * ----------------------------------------------------------------------- */

test("a spoken procedure resolves to a tooth, surfaces and a sitting", () => {
  const [result] = normaliseProcedures([
    procedure({ tooth_spoken: "26", surfaces_spoken: "mesial occlusal", sitting_spoken: "first sitting" }),
  ]);
  assert.equal(result.tooth_fdi, 26);
  assert.deepEqual(result.surfaces, ["M", "O"]);
  assert.equal(result.sitting_number, 1);
  assert.equal(result.scope, "tooth");
  assert.equal(result.tooth_spoken, "26", "the evidence survives resolution");
});

test("surfaces are dropped when the procedure is not on one tooth", () => {
  // The database rejects this combination outright
  // (encounter_procedures_surfaces_scoped), so sending it would be a 500 the
  // dentist cannot act on.
  const [result] = normaliseProcedures([
    procedure({ procedure_name: "Scaling and polishing", tooth_spoken: null, surfaces_spoken: "mesial" }),
  ]);
  assert.equal(result.scope, "full_mouth");
  assert.deepEqual(result.surfaces, []);
});

test("a corrected row is never re-derived", () => {
  // Without this, every re-render would overwrite the dentist's tooth with the
  // model's original reading.
  const corrected = procedure({ tooth_spoken: "36", tooth_fdi: 46, resolved: true });
  const [result] = normaliseProcedures([corrected]);
  assert.equal(result.tooth_fdi, 46, "the dentist's correction stands");
});

/* --------------------------------------------------------------------------
 * The checklist
 * ----------------------------------------------------------------------- */

test("an unresolved tooth reaches the review queue", () => {
  const items = buildReviewChecklist(extraction([procedure({ tooth_spoken: "the back one" })]));
  assert.equal(items.length, 1);
  assert.equal(items[0].key, "procedures.0.tooth_fdi");
  assert.equal(items[0].label, "Procedure 1 tooth");
});

test("a procedure with no tooth spoken at all is still queued", () => {
  // Scope infers to `tooth` for an unrecognised name with no tooth, and a
  // per-tooth procedure charted against nothing is exactly what review is for.
  const items = buildReviewChecklist(extraction([procedure({ tooth_spoken: null })]));
  assert.equal(items.length, 1);
});

test("a resolved procedure does not clutter the queue", () => {
  assert.deepEqual(buildReviewChecklist(extraction([procedure({ tooth_spoken: "36" })])), []);
  // Nor does one that legitimately has no tooth.
  assert.deepEqual(
    buildReviewChecklist(
      extraction([procedure({ procedure_name: "Scaling and polishing", tooth_spoken: null })]),
    ),
    [],
  );
});

test("a model uncertainty naming a procedure is no longer silently dropped", () => {
  // THE regression this test exists for. `normaliseReviewKey`'s regex only
  // matched `prescription...`, so a `procedures.0.tooth_fdi` uncertainty
  // returned null and the flag vanished — the model could say "I am unsure
  // which tooth" and the dentist would never be told.
  const draft = extraction([procedure({ tooth_spoken: "36" })]);
  draft.uncertain_fields = ["procedures.0.tooth_fdi"];
  const items = buildReviewChecklist(draft);
  assert.equal(items.length, 1, "the flag must survive");
  assert.equal(items[0].key, "procedures.0.tooth_fdi");
});

test("both bracket and dot spellings of a procedure key are accepted", () => {
  const draft = extraction([procedure(), procedure({ tooth_spoken: "46" })]);
  draft.uncertain_fields = ["procedures[1].tooth_spoken"];
  const items = buildReviewChecklist(draft);
  // tooth_spoken and tooth_fdi collapse to one row — two rows for one field
  // would make the dentist confirm the same thing twice.
  assert.deepEqual(items.map((i) => i.key), ["procedures.1.tooth_fdi"]);
});

test("a procedure key pointing past the end of the list is dropped", () => {
  const draft = extraction([procedure()]);
  draft.uncertain_fields = ["procedures.7.tooth_fdi"];
  assert.deepEqual(buildReviewChecklist(draft), []);
});

test("procedure and prescription flags coexist", () => {
  const draft = extraction([procedure({ tooth_spoken: "nowhere" })]);
  draft.prescription = [
    { drug_name: "Augmentin", strength: "625 mg", form: "tab", frequency_spoken: "gibberish", duration: null, instructions: null },
  ];
  const keys = buildReviewChecklist(draft).map((i) => i.key);
  assert.ok(keys.includes("procedures.0.tooth_fdi"));
  assert.ok(keys.includes("prescription.0.frequency_spoken"));
});

test("a spoken tooth finding resolves to the odontogram without becoming a procedure", () => {
  const finding: ReviewToothFinding = {
    finding: "caries",
    tooth_spoken: "lower left first molar",
    surfaces_spoken: "mesial occlusal",
    state: "existing",
    severity: "moderate",
    note: null,
  };
  const [resolved] = normaliseToothFindings([finding]);
  assert.equal(resolved.tooth_fdi, 36);
  assert.deepEqual(resolved.surfaces, ["M", "O"]);
  assert.equal(resolved.finding, "caries");
});

test("an unresolved spoken finding is placed in the review queue", () => {
  const draft = extraction([]);
  draft.tooth_findings = [{
    finding: "fracture",
    tooth_spoken: "the broken back one",
    surfaces_spoken: null,
    state: "existing",
    severity: null,
    note: null,
  }];
  const items = buildReviewChecklist(draft);
  assert.deepEqual(items.map((item) => item.key), ["tooth_findings.0.tooth_fdi"]);
});
