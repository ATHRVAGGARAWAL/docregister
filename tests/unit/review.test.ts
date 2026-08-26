import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReviewChecklist,
  normalisePatientPhone,
  patientPhoneError,
  type ReviewExtraction,
} from "../../src/lib/encounters/review.ts";

function extraction(overrides: Partial<ReviewExtraction> = {}): ReviewExtraction {
  return {
    patient_name: "Sunita Devi",
    age_years: 42,
    diagnosis: "Fever",
    treatment: null,
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

test("phone matching normalises punctuation and rejects unsafe lengths", () => {
  assert.equal(normalisePatientPhone("+91 98765-43210"), "+919876543210");
  assert.equal(patientPhoneError("123"), "Phone number must contain 7 to 15 digits.");
  assert.equal(patientPhoneError("+91 98765 43210"), null);
});
