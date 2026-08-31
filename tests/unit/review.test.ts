import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReviewChecklist,
  normalisePatientPhone,
  patientPhoneError,
  type ReviewExtraction,
} from "../../src/lib/encounters/review.ts";
import { validateExtraction } from "../../src/lib/llm/schema.ts";

function extraction(overrides: Partial<ReviewExtraction> = {}): ReviewExtraction {
  return {
    patient_name: "Sunita Devi",
    age_years: 42,
    diagnosis: "Fever",
    treatment: null,
    consultation_fee_inr: 500,
    procedures: [],
    tooth_findings: [],
    prescription: [
      {
        drug_name: "Dolo",
        strength: "650 mg",
        form: "tablet",
        route: "PO",
        frequency_spoken: null,
        duration: "5 days",
        instructions: "after food",
      },
    ],
    uncertain_fields: ["prescription[0].strength"],
    notes_for_doctor: null,
    ...overrides,
  };
}

test("review checklist normalises extractor array paths and missing frequencies", () => {
  const items = buildReviewChecklist(extraction());
  assert.deepEqual(
    items.map((item) => item.key),
    ["prescription.0.strength", "prescription.0.frequency_spoken"],
  );
});

test("review checklist includes an uncertain spoken consultation amount", () => {
  const items = buildReviewChecklist(
    extraction({ uncertain_fields: ["consultation_fee_inr"] }),
  );
  assert.deepEqual(items.map((item) => item.key), ["consultation_fee_inr", "prescription.0.frequency_spoken"]);
});

test("consultation amounts are range-checked before review", () => {
  assert.equal(validateExtraction(extraction()).some((issue) => issue.field === "consultation_fee_inr"), false);
  assert.equal(
    validateExtraction(extraction({ consultation_fee_inr: 1_000_001 })).some(
      (issue) => issue.field === "consultation_fee_inr",
    ),
    true,
  );
});

test("phone matching normalises punctuation and rejects unsafe lengths", () => {
  assert.equal(normalisePatientPhone("+91 98765-43210"), "+919876543210");
  assert.equal(patientPhoneError("123"), "Phone number must contain 7 to 15 digits.");
  assert.equal(patientPhoneError("+91 98765 43210"), null);
});

test("a checklist survives an extraction that is missing its arrays", () => {
  // `buildReviewChecklist` runs in a `useState` initialiser inside the review
  // sheet, so a throw here is a throw during render: the doctor finishes
  // dictating and the sheet is replaced by an error boundary, with the visit
  // unsaved. An extraction reaches it from three places — a model response, a
  // stored draft row, and the reconciliation pass — and only the first is
  // schema-checked, so the missing-array case is reachable rather than
  // theoretical. It was, until this guard: an end-to-end dictation crashed with
  // "extraction.uncertain_fields is not iterable".
  // Losing `uncertain_fields` costs the model's own flags and nothing else: the
  // frequency check still runs over the prescription, so the doctor keeps the
  // half of the queue this codebase derives rather than trusts.
  const noUncertain = {
    ...extraction(),
    uncertain_fields: undefined as unknown as string[],
  };
  const fromPrescriptionOnly = buildReviewChecklist(noUncertain);
  assert.ok(
    fromPrescriptionOnly.every((item) => item.key.startsWith("prescription.")),
    "only prescription-derived entries should survive a missing uncertain_fields",
  );

  const noPrescription = {
    ...extraction(),
    prescription: undefined as unknown as ReviewExtraction["prescription"],
    uncertain_fields: [],
  };
  assert.deepEqual(buildReviewChecklist(noPrescription), []);

  // Both gone at once is the shape an empty draft row produces.
  const neither = {
    ...extraction(),
    prescription: undefined as unknown as ReviewExtraction["prescription"],
    uncertain_fields: undefined as unknown as string[],
  };
  assert.deepEqual(buildReviewChecklist(neither), []);
});
