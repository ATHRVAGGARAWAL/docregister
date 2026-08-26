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
